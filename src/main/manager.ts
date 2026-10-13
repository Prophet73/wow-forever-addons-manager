import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { addonKey, needsAction } from "../shared/addon";
import type { WowClass } from "../shared/classes";
import type {
  AppUpdate,
  AddonRef,
  AppState,
  ApplyPackResult,
  Job,
  JobKind,
  Pack,
  ProviderId,
  ReleaseType,
  Settings,
  TrackedAddon,
  UntrackedFolder,
  WtfCopyRequest,
  WtfState,
} from "../shared/types";
import { addonsDir, isGameRunning } from "./game";
import { resolveGameFolder } from "./gameFolder";
import { deleteBackup, installFile, removeFolders, restoreBackup } from "./installer";
import { readPackFile, writePackFile } from "./packFile";
import { decodePack, dedupeAddons, encodePack } from "./packs";
import { applySettings, collectSettings } from "./packSettings";
import { CurseForge } from "./providers/curseforge";
import { GitHub } from "./providers/github";
import { nameFromFile, type FileQuery, type Provider, type ResolvedAddon } from "./providers/types";
import { findAppUpdate } from "./selfUpdate";
import { Store } from "./store";
import { NEEDTOKNOW_FILE, applyTimerGroups, renameProfiles } from "./timers/needToKnow";
import { timerGroups } from "./timers/presets";
import { listAddonFolders, readToc } from "./toc";
import * as wtf from "./wtf";
import { copyXPerlPositions, xperlPositionsFile } from "./xperlPositions";

/** Owns the tracked-addon list and runs install/update jobs one at a time. */
export class Manager {
  readonly cf: CurseForge;
  private readonly providers: Record<ProviderId, Provider>;
  private jobs: Job[] = [];
  private queue: { job: Job; run: (job: Job) => Promise<void> }[] = [];
  private running = false;
  appUpdate: AppUpdate | null = null;
  private gameRunning = false;
  private emitTimer: NodeJS.Timeout | null = null;

  constructor(
    readonly store: Store,
    private readonly onChange: (state: AppState) => void,
    readonly appVersion: string,
  ) {
    this.cf = new CurseForge(() => this.store.settings.curseforgeApiKey);
    this.providers = {
      curseforge: this.cf,
      github: new GitHub(() => this.store.settings.githubToken),
    };
  }

  private get settings(): Settings {
    return this.store.settings;
  }

  // ---- state -----------------------------------------------------------------

  async state(): Promise<AppState> {
    this.gameRunning = await isGameRunning(this.settings.gamePath);
    return this.snapshot();
  }

  private snapshot(): AppState {
    const dir = this.settings.gamePath ? addonsDir(this.settings.gamePath) : "";
    return {
      settings: this.settings,
      addons: [...this.store.addons].sort((a, b) => a.name.localeCompare(b.name)),
      untracked: dir ? this.scanUntracked(dir) : [],
      jobs: this.jobs,
      gameRunning: this.gameRunning,
      addonsDirExists: !!dir && fs.existsSync(dir),
      keyStatus: this.cf.keyStatus,
      packs: [...this.store.packs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      appUpdate: this.appUpdate,
      appVersion: this.appVersion,
    };
  }

  /** Coalesces bursts of progress updates into one state push per ~100 ms. */
  private emit(): void {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.onChange(this.snapshot());
    }, 100);
  }

  private scanUntracked(dir: string): UntrackedFolder[] {
    const owned = new Set(this.store.addons.flatMap((a) => a.folders.map((f) => f.toLowerCase())));
    return listAddonFolders(dir)
      .filter((f) => !owned.has(f.toLowerCase()))
      .map((folder) => {
        const toc = readToc(path.join(dir, folder));
        return {
          folder,
          title: toc?.title ?? folder,
          version: toc?.version ?? "",
          interface: toc?.interface ?? "",
          curseProjectId: toc?.curseProjectId ?? null,
        };
      });
  }

  async saveSettings(patch: Partial<Settings>): Promise<AppState> {
    if (patch.gamePath) {
      const found = await resolveGameFolder(patch.gamePath);
      if (!found) throw new Error(`В «${patch.gamePath}» и рядом нет WowB.exe. Укажи папку, куда установлен WoW Forever.`);
      patch = { ...patch, gamePath: found };
    }
    const keyChanged = patch.curseforgeApiKey !== undefined && patch.curseforgeApiKey !== this.settings.curseforgeApiKey;
    this.store.updateSettings(patch);
    if (keyChanged) await this.cf.verifyKey();
    return this.snapshot();
  }

  async verifyKey(): Promise<AppState> {
    await this.cf.verifyKey();
    return this.snapshot();
  }

  private requireGamePath(): string {
    const p = this.settings.gamePath;
    if (!p || !fs.existsSync(p)) throw new Error("Укажи папку игры в настройках.");
    return p;
  }

  private query(a?: TrackedAddon): FileQuery {
    return { flavorTypeId: this.settings.flavorTypeId, maxReleaseType: a?.maxReleaseType ?? this.settings.maxReleaseType };
  }

  // ---- tracking ----------------------------------------------------------------

  /** Accepts a CurseForge project id or URL, or a GitHub repo URL. */
  async addAddon(input: string): Promise<AppState> {
    for (const p of Object.values(this.providers)) {
      const found = await p.resolve(input);
      if (found) return this.track({ provider: p.id, id: found.id }, [], found);
    }
    throw new Error("Не понял, что это. Вставь ссылку на CurseForge или GitHub, или Project ID с CurseForge.");
  }

  /** Starts managing a hand-installed addon; its folders get replaced by the latest build. */
  async trackUntracked(curseProjectId: number): Promise<AppState> {
    const dir = addonsDir(this.requireGamePath());
    const folders = this.scanUntracked(dir)
      .filter((u) => u.curseProjectId === curseProjectId)
      .map((u) => u.folder);
    return this.track({ provider: "curseforge", id: String(curseProjectId) }, folders);
  }

  /** Adds an addon to the list and queues its install. `known` is whatever the caller already has. */
  private async track(ref: AddonRef, folders: string[], known: Partial<ResolvedAddon> = {}): Promise<AppState> {
    const key = addonKey(ref);
    if (this.store.getAddon(key)) throw new Error("Этот аддон уже в списке.");
    const provider = this.providers[ref.provider];
    let latest = await provider.latestFile(ref.id, this.query());
    // No build on the default channel (e.g. VuhDo ships only alphas for Forever): take the
    // most stable one there is and pin this addon to that channel.
    let channel: ReleaseType | undefined;
    for (let t = this.settings.maxReleaseType + 1; !latest && t <= 3; t++) {
      latest = await provider.latestFile(ref.id, { ...this.query(), maxReleaseType: t as ReleaseType });
      if (latest) channel = t as ReleaseType;
    }
    if (!latest) throw new Error("У этого аддона нет версии под WoW Forever.");
    const extra = known.iconUrl === undefined || known.categories === undefined ? await provider.info(ref.id) : null;
    this.store.upsertAddon({
      ...ref,
      key,
      name: known.name ?? extra?.name ?? nameFromFile(latest),
      url: known.url ?? extra?.url ?? null,
      iconUrl: known.iconUrl ?? extra?.iconUrl,
      categories: known.categories ?? extra?.categories,
      maxReleaseType: channel,
      installed: null,
      folders,
      latest,
      lastChecked: new Date().toISOString(),
      backups: [],
    });
    this.install(key);
    return this.snapshot();
  }

  async checkUpdates(): Promise<AppState> {
    const addons = [...this.store.addons];
    const errors: string[] = [];
    // A few requests at a time is plenty and keeps us polite.
    for (let i = 0; i < addons.length; i += 4) {
      await Promise.all(
        addons.slice(i, i + 4).map(async (a) => {
          try {
            const provider = this.providers[a.provider];
            const latest = await provider.latestFile(a.id, this.query(a));
            // Addons added before icons/categories existed (or without a CurseForge key) get them now.
            const info = a.iconUrl === undefined || a.categories === undefined ? await provider.info(a.id) : null;
            const cur = this.store.getAddon(a.key);
            if (!cur) return;
            this.store.upsertAddon({
              ...cur,
              latest,
              lastChecked: new Date().toISOString(),
              ...(info && { iconUrl: info.iconUrl, categories: info.categories, url: cur.url ?? info.url }),
            });
          } catch (e) {
            errors.push(`${a.name}: ${(e as Error).message}`);
          }
        }),
      );
    }
    this.gameRunning = await isGameRunning(this.settings.gamePath);
    if (errors.length) throw new Error(errors.join("\n"));
    return this.snapshot();
  }

  setAddonChannel(key: string, maxReleaseType: ReleaseType | null): AppState {
    const a = this.store.getAddon(key);
    if (a) this.store.upsertAddon({ ...a, maxReleaseType: maxReleaseType ?? undefined });
    return this.snapshot();
  }

  // ---- jobs ----------------------------------------------------------------------

  private enqueue(kind: JobKind, a: TrackedAddon, run: (job: Job) => Promise<void>): void {
    if (this.jobs.some((j) => j.key === a.key && (j.state === "queued" || j.state === "running"))) return;
    const job: Job = { id: randomUUID(), kind, key: a.key, name: a.name, state: "queued", progress: null, stage: "В очереди" };
    this.jobs = [job, ...this.jobs].slice(0, 30);
    this.queue.push({ job, run });
    this.emit();
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let next;
      while ((next = this.queue.shift())) {
        const { job, run } = next;
        job.state = "running";
        job.stage = "Запуск";
        this.emit();
        try {
          if (await isGameRunning(this.settings.gamePath)) throw new Error("Игра запущена. Закрой WoW и повтори.");
          await run(job);
          job.state = "done";
          job.stage = "Готово";
          job.progress = 1;
        } catch (e) {
          job.state = "error";
          job.error = (e as Error).message;
          job.stage = "Ошибка";
        }
        this.emit();
      }
    } finally {
      this.running = false;
    }
  }

  install(key: string): void {
    const a = this.store.getAddon(key);
    if (!a) return;
    this.enqueue(a.installed ? "update" : "install", a, async (job) => {
      const gamePath = this.requireGamePath();
      const cur = this.store.getAddon(key)!;
      const provider = this.providers[cur.provider];
      job.stage = "Поиск версии";
      this.emit();
      const latest = (await provider.latestFile(cur.id, this.query(cur))) ?? cur.latest;
      if (!latest) throw new Error("Нет версии под WoW Forever.");
      const intact = cur.folders.every((f) => fs.existsSync(path.join(addonsDir(gamePath), f)));
      if (cur.installed?.fileId === latest.fileId && intact) {
        this.store.upsertAddon({ ...cur, latest, lastChecked: new Date().toISOString() });
        return;
      }
      const res = await installFile({
        gamePath,
        addonKey: key,
        file: latest,
        url: await provider.downloadUrl(cur.id, latest),
        previous: cur.installed,
        previousFolders: cur.folders,
        onProgress: (stage, fraction) => {
          job.stage = stage;
          job.progress = fraction;
          this.emit();
        },
      });
      const fresh = this.store.getAddon(key)!;
      const keep = Math.max(0, this.settings.backupsToKeep);
      const backups = res.backup ? [res.backup, ...fresh.backups] : fresh.backups;
      for (const old of backups.slice(keep)) await deleteBackup(old).catch(() => {});
      this.store.upsertAddon({
        ...fresh,
        installed: latest,
        latest,
        folders: res.folders,
        backups: backups.slice(0, keep),
        lastChecked: new Date().toISOString(),
      });
    });
  }

  updateAll(): void {
    for (const a of this.store.addons) if (needsAction(a)) this.install(a.key);
  }

  rollback(key: string): void {
    const a = this.store.getAddon(key);
    if (!a || a.backups.length === 0) return;
    this.enqueue("rollback", a, async (job) => {
      const gamePath = this.requireGamePath();
      const cur = this.store.getAddon(key)!;
      const [backup, ...rest] = cur.backups;
      job.stage = "Откат";
      this.emit();
      const folders = await restoreBackup(gamePath, cur.folders, backup);
      this.store.upsertAddon({ ...cur, installed: backup.file, folders, backups: rest });
    });
  }

  /** Deletes the addon's folders and backups and stops tracking it. */
  remove(key: string): void {
    const a = this.store.getAddon(key);
    if (!a) return;
    this.enqueue("remove", a, async (job) => {
      const gamePath = this.requireGamePath();
      job.stage = "Удаление";
      this.emit();
      const cur = this.store.getAddon(key)!;
      await removeFolders(gamePath, cur.folders);
      for (const b of cur.backups) await deleteBackup(b).catch(() => {});
      this.store.removeAddon(key);
    });
  }

  // ---- packs ---------------------------------------------------------------------

  savePack(input: Pick<Pack, "name" | "description" | "addons"> & { id?: string }): AppState {
    const name = input.name.trim();
    if (!name) throw new Error("Дай сборке название.");
    const now = new Date().toISOString();
    const existing = input.id ? this.store.packs.find((p) => p.id === input.id) : undefined;
    this.store.upsertPack({
      id: existing?.id ?? randomUUID(),
      name,
      description: input.description?.trim() ?? "",
      addons: dedupeAddons(input.addons),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      settings: existing?.settings,
    });
    return this.snapshot();
  }

  deletePack(id: string): AppState {
    this.store.removePack(id);
    fs.rmSync(this.packFilePath(id), { force: true });
    return this.snapshot();
  }

  /** Where the .fapack file an imported pack came in is kept, for its settings. */
  private packFilePath(id: string): string {
    return path.join(this.store.dir, "packs", `${id}.fapack`);
  }

  /**
   * Installs everything in the pack that is missing; optionally removes addons not in it. With
   * `charId`, first lays the interface settings that came with the pack onto that character.
   */
  async applyPack(id: string, removeOthers: boolean, charId: string | null): Promise<ApplyPackResult> {
    const pack = this.store.packs.find((p) => p.id === id);
    if (!pack) throw new Error("Сборка не найдена.");
    this.requireGamePath();
    const result: ApplyPackResult = { queued: 0, alreadyInstalled: 0, removed: 0, failed: [], settingsFiles: 0 };
    if (charId && pack.settings) {
      const p = await this.requireGameClosed();
      result.settingsFiles = await applySettings(p, charId, readPackFile(this.packFilePath(id)));
    }
    for (const a of pack.addons) {
      const tracked = this.store.getAddon(addonKey(a));
      if (tracked?.installed) {
        result.alreadyInstalled++;
        continue;
      }
      try {
        if (tracked) this.install(tracked.key);
        else await this.track(a, [], { name: a.name });
        result.queued++;
      } catch (e) {
        result.failed.push(`${a.name}: ${(e as Error).message}`);
      }
    }
    if (removeOthers) {
      const keep = new Set(pack.addons.map(addonKey));
      for (const t of this.store.addons) {
        if (!keep.has(t.key)) {
          this.remove(t.key);
          result.removed++;
        }
      }
    }
    this.emit();
    return result;
  }

  exportPack(id: string): string {
    const pack = this.store.packs.find((p) => p.id === id);
    if (!pack) throw new Error("Сборка не найдена.");
    return encodePack(pack);
  }

  importPack(code: string): AppState {
    return this.savePack(decodePack(code));
  }

  /** Writes the pack plus `charId`'s settings for the pack's addons to a .fapack file. */
  exportPackFile(id: string, charId: string, file: string): void {
    const pack = this.store.packs.find((p) => p.id === id);
    if (!pack) throw new Error("Сборка не найдена.");
    const folders = pack.addons.flatMap((a) => this.store.getAddon(addonKey(a))?.folders ?? []);
    writePackFile(file, { ...pack, ...collectSettings(this.requireGamePath(), charId, folders) });
  }

  /** Adds the pack from a .fapack file and keeps the file for its settings. */
  importPackFile(file: string): AppState {
    const contents = readPackFile(file);
    const before = new Set(this.store.packs.map((p) => p.id));
    this.savePack(contents);
    const pack = this.store.packs.find((p) => !before.has(p.id))!;
    fs.mkdirSync(path.dirname(this.packFilePath(pack.id)), { recursive: true });
    fs.copyFileSync(file, this.packFilePath(pack.id));
    this.store.upsertPack({ ...pack, settings: { from: contents.from, files: Object.keys(contents.files).length } });
    return this.snapshot();
  }

  // ---- characters (WTF) ----------------------------------------------------------

  /** Characters with the class chosen for them by hand. */
  wtfState(): WtfState {
    const p = this.settings.gamePath;
    if (!p) return { wtfExists: false, characters: [], backups: [] };
    const state = wtf.wtfState(p);
    for (const c of state.characters) c.wowClass = this.store.characterClass(c.id);
    return state;
  }

  private async requireGameClosed(): Promise<string> {
    const p = this.requireGamePath();
    if (await isGameRunning(this.settings.gamePath)) throw new Error("Игра запущена. Закрой WoW: она перезапишет настройки при выходе.");
    return p;
  }

  /**
   * Copies character files, plus what lives elsewhere but belongs to the character: X-Perl frame
   * positions (account-wide, keyed by name) with the layout, and NeedToKnow profile names.
   */
  async wtfCopy(req: WtfCopyRequest): Promise<WtfState> {
    const p = await this.requireGameClosed();
    const [account, , fromFolder] = req.from.split("/");
    const xperl = req.groups.includes("layout") ? xperlPositionsFile(wtf.accountDir(p, account), fromFolder) : null;
    const targets = await wtf.copySettings(p, req, xperl ? [`${account}/${xperl}`] : []);

    const folders = targets.map((t) => t.split("/")[2]);
    if (xperl) copyXPerlPositions(wtf.accountDir(p, account), fromFolder, folders);
    if (req.savedVariables.includes(NEEDTOKNOW_FILE)) {
      for (const t of targets) {
        const file = path.join(wtf.charDir(p, t), "SavedVariables", `${NEEDTOKNOW_FILE}.lua`);
        fs.writeFileSync(file, renameProfiles(fs.readFileSync(file, "utf8"), t.split("/")[2].split("-")[0]), "utf8");
      }
    }
    return this.wtfState();
  }

  setAppUpdate(update: AppUpdate | null): void {
    this.appUpdate = update;
    this.emit();
  }

  async checkAppUpdate(): Promise<AppState> {
    this.appUpdate = await findAppUpdate(this.appVersion);
    return this.snapshot();
  }

  /** True while installs are queued or running; quitting then could cut a move in half. */
  get busy(): boolean {
    return this.running || this.queue.length > 0;
  }

  setCharacterClass(charId: string, wowClass: WowClass | null): WtfState {
    this.store.setCharacterClass(charId, wowClass);
    return this.wtfState();
  }

  /** Replaces the character's NeedToKnow groups with its class preset, after a restorable backup. */
  async applyTimerPreset(charId: string): Promise<WtfState> {
    const p = await this.requireGameClosed();
    const char = this.wtfState().characters.find((c) => c.id === charId);
    if (!char) throw new Error("Такого персонажа нет.");
    if (!char.wowClass) throw new Error("Сначала выбери класс персонажа.");
    const rel = path.join("SavedVariables", `${NEEDTOKNOW_FILE}.lua`);
    const file = path.join(wtf.charDir(p, charId), rel);
    if (!fs.existsSync(file)) throw new Error("У персонажа ещё нет настроек NeedToKnow: зайди им в игру с включённым NeedToKnow.");
    const updated = applyTimerGroups(fs.readFileSync(file, "utf8"), timerGroups(char.wowClass));
    await wtf.backupBeforeWrite(p, [charId], [rel]);
    fs.writeFileSync(file, updated, "utf8");
    return this.wtfState();
  }

  async wtfRestore(backupId: string): Promise<WtfState> {
    const p = await this.requireGameClosed();
    await wtf.restoreBackup(p, backupId);
    return this.wtfState();
  }
}
