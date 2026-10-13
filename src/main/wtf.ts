import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { WtfBackup, WtfCharacter, WtfCopyRequest, WtfGroup, WtfState } from "../shared/types";
import { workDir } from "./game";

/** Per-character files in WTF\Account\<acc>\<realm>\<char>\ that make up each group. */
export const GROUP_FILES: Record<WtfGroup, string[]> = {
  addonList: ["AddOns.txt"],
  layout: ["layout-local.txt", "edit-mode-cache-character.txt"],
  chat: ["chat-cache.txt"],
  bindings: ["bindings-cache.wtf", "click-bindings-cache.txt"],
  macros: ["macros-cache.txt"],
  gameSettings: ["config-cache.wtf"],
};

const GROUPS = Object.keys(GROUP_FILES) as WtfGroup[];

function accountRoot(gamePath: string): string {
  return path.join(gamePath, "WTF", "Account");
}

function backupsRoot(gamePath: string): string {
  return path.join(workDir(gamePath), "wtf-backups");
}

function dirs(p: string): string[] {
  try {
    return fs
      .readdirSync(p, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "SavedVariables")
      .map((d) => d.name);
  } catch {
    return [];
  }
}

const safeSegment = (p: string) => !!p && p !== "." && p !== ".." && !/[\\/:]/.test(p);

/** Rejects ids that are not exactly account/realm/character inside WTF\Account. */
export function charDir(gamePath: string, id: string): string {
  const parts = id.split("/");
  if (parts.length !== 3 || !parts.every(safeSegment)) throw new Error(`Неверный персонаж: ${id}`);
  return path.join(accountRoot(gamePath), ...parts);
}

/** WTF\Account\<account>, home of the account-wide SavedVariables. */
export function accountDir(gamePath: string, account: string): string {
  if (!safeSegment(account)) throw new Error(`Неверный аккаунт: ${account}`);
  return path.join(accountRoot(gamePath), account);
}

export function listCharacters(gamePath: string): WtfCharacter[] {
  const root = accountRoot(gamePath);
  const out: WtfCharacter[] = [];
  for (const account of dirs(root)) {
    for (const realm of dirs(path.join(root, account))) {
      for (const name of dirs(path.join(root, account, realm))) {
        const dir = path.join(root, account, realm, name);
        let sv: string[] = [];
        try {
          sv = fs
            .readdirSync(path.join(dir, "SavedVariables"))
            .filter((f) => f.toLowerCase().endsWith(".lua"))
            .map((f) => f.slice(0, -4))
            .sort((a, b) => a.localeCompare(b));
        } catch {
          // no per-character saved variables yet
        }
        const has = Object.fromEntries(
          GROUPS.map((g) => [g, GROUP_FILES[g].some((f) => fs.existsSync(path.join(dir, f)))]),
        ) as Record<WtfGroup, boolean>;
        const modified = fs.statSync(dir).mtime.toISOString();
        out.push({
          id: `${account}/${realm}/${name}`,
          account,
          realm,
          name,
          savedVariables: sv,
          has,
          modified,
          wowClass: null,
        });
      }
    }
  }
  return out.sort((a, b) => b.modified.localeCompare(a.modified));
}

export function listBackups(gamePath: string): WtfBackup[] {
  const root = backupsRoot(gamePath);
  const out: WtfBackup[] = [];
  for (const id of dirs(root)) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(root, id, "backup.json"), "utf8")) as WtfBackup;
      out.push({ ...meta, id });
    } catch {
      // ignore folders without metadata
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function wtfState(gamePath: string): WtfState {
  return {
    wtfExists: fs.existsSync(accountRoot(gamePath)),
    characters: listCharacters(gamePath),
    backups: listBackups(gamePath),
  };
}

/** Relative file paths (inside a character folder) a copy request touches. */
function filesFor(req: WtfCopyRequest): string[] {
  const files: string[] = [];
  for (const g of req.groups) files.push(...(GROUP_FILES[g] ?? []));
  for (const sv of req.savedVariables) {
    if (/[\\/]|\.\./.test(sv)) throw new Error(`Неверное имя файла: ${sv}`);
    files.push(path.join("SavedVariables", `${sv}.lua`), path.join("SavedVariables", `${sv}.lua.bak`));
  }
  return files;
}

interface BackupMeta extends WtfBackup {
  /** Character files that did not exist yet; restore deletes them. */
  created: string[];
  /** Account-wide files ("<account>/SavedVariables/X.lua"), saved under _account/. */
  accountFiles?: string[];
}

const ACCOUNT_BACKUP_DIR = "_account";
const KEEP_BACKUPS = 10;

/**
 * Saves what is about to change so it can be restored: `files` (relative to each target character
 * folder) and `accountFiles` (relative to WTF\Account). Old backups beyond the limit are dropped.
 */
export async function backupBeforeWrite(gamePath: string, targets: string[], files: string[], accountFiles: string[] = []): Promise<void> {
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const bdir = path.join(backupsRoot(gamePath), id);
  const created: string[] = [];
  for (const t of targets) {
    const tdir = charDir(gamePath, t);
    for (const f of files) {
      const dest = path.join(tdir, f);
      if (fs.existsSync(dest)) {
        await fsp.mkdir(path.dirname(path.join(bdir, t, f)), { recursive: true });
        await fsp.copyFile(dest, path.join(bdir, t, f));
      } else {
        created.push(`${t}/${f.split(path.sep).join("/")}`);
      }
    }
  }
  for (const rel of accountFiles) {
    const [account, ...rest] = rel.split("/");
    await fsp.mkdir(path.dirname(path.join(bdir, ACCOUNT_BACKUP_DIR, rel)), { recursive: true });
    await fsp.copyFile(path.join(accountDir(gamePath, account), ...rest), path.join(bdir, ACCOUNT_BACKUP_DIR, rel));
  }
  await fsp.mkdir(bdir, { recursive: true });
  const meta: BackupMeta = {
    id,
    createdAt: new Date().toISOString(),
    targets,
    fileCount: files.length * targets.length + accountFiles.length,
    created,
    accountFiles,
  };
  await fsp.writeFile(path.join(bdir, "backup.json"), JSON.stringify(meta, null, 2), "utf8");

  for (const old of listBackups(gamePath).slice(KEEP_BACKUPS)) {
    await fsp.rm(path.join(backupsRoot(gamePath), old.id), { recursive: true, force: true });
  }
}

/**
 * Copies settings from one character to others, after backing up everything it overwrites or
 * creates. `accountFiles` are account-wide files the caller is about to change as part of the copy.
 */
export async function copySettings(gamePath: string, req: WtfCopyRequest, accountFiles: string[] = []): Promise<string[]> {
  const src = charDir(gamePath, req.from);
  const targets = [...new Set(req.to)].filter((t) => t !== req.from);
  if (targets.length === 0) throw new Error("Выбери, на кого копировать.");
  const files = filesFor(req).filter((f) => fs.existsSync(path.join(src, f)));
  if (files.length === 0) throw new Error("Нечего копировать: у исходного персонажа нет выбранных файлов.");

  await backupBeforeWrite(gamePath, targets, files, accountFiles);
  for (const t of targets) {
    const tdir = charDir(gamePath, t);
    for (const f of files) {
      await fsp.mkdir(path.dirname(path.join(tdir, f)), { recursive: true });
      await fsp.copyFile(path.join(src, f), path.join(tdir, f));
    }
  }
  return targets;
}

/** Puts back every file a copy changed and deletes the files it created. */
export async function restoreBackup(gamePath: string, backupId: string): Promise<void> {
  if (!/^[\w-]+$/.test(backupId)) throw new Error("Неверный бэкап.");
  const bdir = path.join(backupsRoot(gamePath), backupId);
  const meta = JSON.parse(await fsp.readFile(path.join(bdir, "backup.json"), "utf8")) as BackupMeta;

  const walk = async (dir: string): Promise<string[]> => {
    const out: string[] = [];
    for (const d of await fsp.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) out.push(...(await walk(p)));
      else out.push(p);
    }
    return out;
  };

  for (const t of meta.targets) {
    const saved = path.join(bdir, ...t.split("/"));
    if (!fs.existsSync(saved)) continue;
    const tdir = charDir(gamePath, t);
    for (const file of await walk(saved)) {
      const rel = path.relative(saved, file);
      await fsp.mkdir(path.dirname(path.join(tdir, rel)), { recursive: true });
      await fsp.copyFile(file, path.join(tdir, rel));
    }
  }
  for (const c of meta.created) {
    const [acc, realm, name, ...rest] = c.split("/");
    await fsp.rm(path.join(charDir(gamePath, `${acc}/${realm}/${name}`), ...rest), { force: true });
  }
  for (const rel of meta.accountFiles ?? []) {
    const [account, ...rest] = rel.split("/");
    await fsp.copyFile(path.join(bdir, ACCOUNT_BACKUP_DIR, rel), path.join(accountDir(gamePath, account), ...rest));
  }
  await fsp.rm(bdir, { recursive: true, force: true });
}
