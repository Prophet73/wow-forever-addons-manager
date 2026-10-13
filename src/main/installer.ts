import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import yauzl from "yauzl";
import type { BackupEntry, RemoteFile } from "../shared/types";
import { addonsDir, workDir } from "./game";

export type Progress = (stage: string, fraction: number | null) => void;

/** Rename, falling back to copy + delete when source and target are on different drives. */
async function move(from: string, to: string): Promise<void> {
  await fsp.mkdir(path.dirname(to), { recursive: true });
  try {
    await fsp.rename(from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    await fsp.cp(from, to, { recursive: true });
    await fsp.rm(from, { recursive: true, force: true });
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * The CDN answers 403 for a while after a file is published (it isn't propagated yet) and
 * sporadically under load, so retry with backoff before giving up.
 */
async function fetchFile(url: string): Promise<Response> {
  const get = () => fetch(url, { headers: { "User-Agent": "ForeverAddons/0.1" }, redirect: "follow" });
  let res = await get();
  for (const delay of [1500, 4000, 10000]) {
    if (res.ok || ![403, 429, 500, 502, 503, 504].includes(res.status)) break;
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, delay));
    res = await get();
  }
  if (res.status === 403) throw new Error("Не удалось скачать файл: HTTP 403. Если версия вышла только что, CDN её ещё не раздаёт: попробуй через несколько минут.");
  if (!res.ok || !res.body) throw new Error(`Не удалось скачать файл: HTTP ${res.status}`);
  return res;
}

export async function download(url: string, dest: string, expectedSize: number, onProgress: Progress): Promise<void> {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const res = await fetchFile(url);
  const total = Number(res.headers.get("content-length")) || expectedSize || 0;
  let received = 0;
  let lastReport = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length;
      const now = Date.now();
      if (now - lastReport > 150) {
        lastReport = now;
        onProgress("Скачивание", total ? received / total : null);
      }
      cb(null, chunk);
    },
  });
  const tmp = dest + ".part";
  await pipeline(Readable.fromWeb(res.body as never), counter, fs.createWriteStream(tmp));
  if (expectedSize && received !== expectedSize) {
    await fsp.rm(tmp, { force: true });
    throw new Error(`Файл скачался не полностью (${received} из ${expectedSize} байт).`);
  }
  await fsp.rename(tmp, dest);
}

/** Extracts a zip into destDir, refusing entries that would escape it. */
export function extract(zipPath: string, destDir: string, onProgress: Progress): Promise<void> {
  const root = path.resolve(destDir);
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("Не удалось открыть архив"));
      let done = 0;
      const total = zip.entryCount || 1;
      const fail = (e: unknown) => {
        zip.close();
        reject(e);
      };
      zip.on("error", fail);
      zip.on("end", () => resolve());
      zip.on("entry", (entry: yauzl.Entry) => {
        done++;
        if (done % 50 === 0) onProgress("Распаковка", done / total);
        const target = path.resolve(root, entry.fileName);
        if (target !== root && !target.startsWith(root + path.sep)) {
          return fail(new Error(`Подозрительный путь в архиве: ${entry.fileName}`));
        }
        if (entry.fileName.endsWith("/")) {
          fsp.mkdir(target, { recursive: true }).then(() => zip.readEntry(), fail);
          return;
        }
        zip.openReadStream(entry, (e2, stream) => {
          if (e2 || !stream) return fail(e2 ?? new Error("Ошибка чтения архива"));
          fsp
            .mkdir(path.dirname(target), { recursive: true })
            .then(() => pipeline(stream, fs.createWriteStream(target)))
            .then(() => zip.readEntry(), fail);
        });
      });
      zip.readEntry();
    });
  });
}

/** Top-level folders of an extracted archive that look like addons (contain a .toc). */
async function addonFoldersIn(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const d of await fsp.readdir(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const files = await fsp.readdir(path.join(dir, d.name));
    if (files.some((f) => f.toLowerCase().endsWith(".toc"))) out.push(d.name);
  }
  return out;
}

/**
 * Finds the folder whose subfolders are the addons. Usually the archive root, but some
 * GitHub zips wrap everything in one extra folder (e.g. "MyAddon-1.2/MyAddon/MyAddon.toc").
 */
async function findAddonRoot(dir: string): Promise<{ root: string; folders: string[] }> {
  let root = dir;
  for (let depth = 0; depth < 2; depth++) {
    const folders = await addonFoldersIn(root);
    if (folders.length) return { root, folders };
    const dirs = (await fsp.readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory());
    if (dirs.length !== 1) break;
    root = path.join(root, dirs[0].name);
  }
  return { root, folders: [] };
}

export interface InstallResult {
  folders: string[];
  /** Backup of what was replaced, if anything was. */
  backup: BackupEntry | null;
}

/**
 * Downloads and installs a file. Folders being replaced (the addon's old folders plus any
 * folder with the same name) are moved into a backup first; if anything fails, they are
 * moved back so the AddOns folder is never left half-updated.
 */
export async function installFile(opts: {
  gamePath: string;
  /** Addon key; names the addon's backup folder. */
  addonKey: string;
  file: RemoteFile;
  url: string;
  previous: RemoteFile | null;
  previousFolders: string[];
  onProgress: Progress;
}): Promise<InstallResult> {
  const { gamePath, addonKey, file, url, previous, previousFolders, onProgress } = opts;
  const work = workDir(gamePath);
  const zip = path.join(work, "downloads", `${file.fileId}.zip`);
  const staging = path.join(work, "staging", String(file.fileId));
  const target = addonsDir(gamePath);

  await fsp.rm(staging, { recursive: true, force: true });
  try {
    await download(url, zip, file.fileLength, onProgress);
    onProgress("Распаковка", 0);
    await extract(zip, staging, onProgress);
    const { root, folders } = await findAddonRoot(staging);
    if (folders.length === 0) throw new Error("В архиве нет папок аддона (.toc не найден).");

    onProgress("Установка", null);
    await fsp.mkdir(target, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.join(work, "backups", addonKey.replace(/[^\w.-]+/g, "_"), `${previous?.fileId ?? "manual"}-${stamp}`);
    const toReplace = [...new Set([...previousFolders, ...folders])];

    const movedOut: string[] = [];
    const movedIn: string[] = [];
    try {
      for (const f of toReplace) {
        const p = path.join(target, f);
        if (await exists(p)) {
          await move(p, path.join(backupDir, f));
          movedOut.push(f);
        }
      }
      for (const f of folders) {
        await move(path.join(root, f), path.join(target, f));
        movedIn.push(f);
      }
    } catch (e) {
      for (const f of movedIn) await fsp.rm(path.join(target, f), { recursive: true, force: true }).catch(() => {});
      for (const f of movedOut) await move(path.join(backupDir, f), path.join(target, f)).catch(() => {});
      throw e;
    }

    // Only versions we installed ourselves can be rolled back to; anything else that was
    // replaced (a manual install of the same addon) is discarded.
    let backup: BackupEntry | null = null;
    if (movedOut.length > 0 && previous) {
      backup = { file: previous, dir: backupDir, createdAt: new Date().toISOString() };
    } else {
      await fsp.rm(backupDir, { recursive: true, force: true });
    }
    return { folders, backup };
  } finally {
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(zip, { force: true }).catch(() => {});
  }
}

/** Restores a backup, deleting the currently installed folders. */
export async function restoreBackup(gamePath: string, currentFolders: string[], backup: BackupEntry): Promise<string[]> {
  const target = addonsDir(gamePath);
  const restored = (await fsp.readdir(backup.dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  const trash = path.join(workDir(gamePath), "trash", `${Date.now()}`);
  for (const f of new Set([...currentFolders, ...restored])) {
    const p = path.join(target, f);
    if (await exists(p)) await move(p, path.join(trash, f));
  }
  for (const f of restored) await move(path.join(backup.dir, f), path.join(target, f));
  await fsp.rm(backup.dir, { recursive: true, force: true });
  await fsp.rm(trash, { recursive: true, force: true });
  return restored;
}

export async function removeFolders(gamePath: string, folders: string[]): Promise<void> {
  const target = addonsDir(gamePath);
  for (const f of folders) await fsp.rm(path.join(target, f), { recursive: true, force: true });
}

export async function deleteBackup(backup: BackupEntry): Promise<void> {
  await fsp.rm(backup.dir, { recursive: true, force: true });
}
