import fs from "node:fs";
import path from "node:path";
import { addonKey } from "../shared/addon";
import { isWowClass, type WowClass } from "../shared/classes";
import type { Pack, PackAddon, Settings, TrackedAddon } from "../shared/types";

export const FOREVER_TYPE_ID = 88568;

const DEFAULT_SETTINGS: Settings = {
  gamePath: "",
  flavorTypeId: FOREVER_TYPE_ID,
  curseforgeApiKey: "",
  githubToken: "",
  maxReleaseType: 1,
  backupsToKeep: 2,
  checkOnStartup: true,
};

interface StoreData {
  version: 2;
  settings: Settings;
  addons: TrackedAddon[];
  packs: Pack[];
  /** Classes chosen by hand, by WTF character id. */
  characterClasses: Record<string, WowClass>;
}

/** JSON file store in the app's userData folder. Writes are atomic (tmp + rename). */
export class Store {
  private data: StoreData;
  private readonly file: string;

  constructor(readonly dir: string) {
    this.file = path.join(dir, "store.json");
    this.data = this.load();
  }

  private load(): StoreData {
    let raw: Partial<{ settings: Settings; addons: unknown[]; packs: Pack[]; characterClasses: Record<string, unknown> }>;
    try {
      raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      return { version: 2, settings: { ...DEFAULT_SETTINGS }, addons: [], packs: [], characterClasses: {} };
    }
    return {
      version: 2,
      settings: { ...DEFAULT_SETTINGS, ...raw.settings },
      addons: (raw.addons ?? []).map(migrateAddon),
      packs: (raw.packs ?? []).map((p) => ({ ...p, addons: p.addons.map(migrateRef) })),
      characterClasses: Object.fromEntries(Object.entries(raw.characterClasses ?? {}).filter(([, c]) => isWowClass(c))) as Record<string, WowClass>,
    };
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
    // On Windows the rename fails while another process (antivirus, an editor, a script)
    // has store.json open; that lasts milliseconds, so wait a little and retry.
    for (let attempt = 0; ; attempt++) {
      try {
        fs.renameSync(tmp, this.file);
        return;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (attempt >= 10 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw e;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1));
      }
    }
  }

  get settings(): Settings {
    return this.data.settings;
  }

  updateSettings(patch: Partial<Settings>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.save();
  }

  get addons(): TrackedAddon[] {
    return this.data.addons;
  }

  getAddon(key: string): TrackedAddon | undefined {
    return this.data.addons.find((a) => a.key === key);
  }

  upsertAddon(addon: TrackedAddon): void {
    const i = this.data.addons.findIndex((a) => a.key === addon.key);
    if (i >= 0) this.data.addons[i] = addon;
    else this.data.addons.push(addon);
    this.save();
  }

  removeAddon(key: string): void {
    this.data.addons = this.data.addons.filter((a) => a.key !== key);
    this.save();
  }

  get packs(): Pack[] {
    return this.data.packs;
  }

  upsertPack(pack: Pack): void {
    const i = this.data.packs.findIndex((p) => p.id === pack.id);
    if (i >= 0) this.data.packs[i] = pack;
    else this.data.packs.push(pack);
    this.save();
  }

  removePack(id: string): void {
    this.data.packs = this.data.packs.filter((p) => p.id !== id);
    this.save();
  }

  characterClass(charId: string): WowClass | null {
    return this.data.characterClasses[charId] ?? null;
  }

  setCharacterClass(charId: string, wowClass: WowClass | null): void {
    if (wowClass) this.data.characterClasses[charId] = wowClass;
    else delete this.data.characterClasses[charId];
    this.save();
  }
}

/** Version 1 stored CurseForge addons by numeric projectId only. */
type V1Ref = { provider?: string; projectId?: number; id?: string; name: string };

function migrateRef<T extends PackAddon>(r: T | V1Ref): T {
  if ("id" in r && r.id) return r as T;
  const v1 = r as V1Ref;
  return { ...v1, provider: "curseforge", id: String(v1.projectId) } as unknown as T;
}

function migrateAddon(raw: unknown): TrackedAddon {
  const a = migrateRef(raw as TrackedAddon);
  const { projectId: _drop, ...rest } = a as TrackedAddon & { projectId?: number };
  return { ...rest, key: addonKey(a), url: a.url ?? null, backups: a.backups ?? [] };
}
