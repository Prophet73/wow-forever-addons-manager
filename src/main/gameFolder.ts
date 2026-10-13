import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/** The Forever client; Classic Era and retail folders have other exes, so they never match. */
const CLIENT_EXE = "WowB.exe";

export function isGameFolder(dir: string): boolean {
  return fs.existsSync(path.join(dir, CLIENT_EXE));
}

async function subdirs(dir: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

/** Client folders directly inside dir (e.g. "World of Warcraft" → its "_classic_beta_"). */
async function clientsIn(dir: string): Promise<string[]> {
  return (await subdirs(dir)).filter(isGameFolder);
}

/**
 * Turns whatever folder the user picked into the client folder: the "World of Warcraft" root,
 * Interface\AddOns, WTF or any folder below the client all lead to it. Null if no client is near.
 */
export async function resolveGameFolder(picked: string): Promise<string | null> {
  const start = path.resolve(picked);
  for (let p = start; ; p = path.dirname(p)) {
    if (isGameFolder(p)) return p;
    if (path.dirname(p) === p) break;
  }
  const direct = await clientsIn(start);
  if (direct.length) return direct[0];
  for (const d of await subdirs(start)) {
    const nested = await clientsIn(d);
    if (nested.length) return nested[0];
  }
  return null;
}

/** Folder of a running Forever client, if the game is open right now. */
function runningClient(): Promise<string | null> {
  if (process.platform !== "win32") return Promise.resolve(null);
  return new Promise((resolve) => {
    const cmd = `(Get-Process ${path.parse(CLIENT_EXE).name} -ErrorAction SilentlyContinue | Select-Object -First 1).Path`;
    execFile("powershell", ["-NoProfile", "-Command", cmd], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      const exe = stdout?.trim();
      resolve(err || !exe ? null : path.dirname(exe));
    });
  });
}

/**
 * Looks for Forever clients without asking the user. The client writes nothing to the registry,
 * so this checks a running game and then "World of Warcraft" folders at the root of every drive
 * and one level below it (D:\Games\World of Warcraft, C:\Program Files (x86)\World of Warcraft).
 */
export async function findGameFolders(): Promise<string[]> {
  const drives = "CDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => `${l}:\\`).filter((d) => fs.existsSync(d));
  const roots = await Promise.all(
    drives.map(async (d) => [path.join(d, "World of Warcraft"), ...(await subdirs(d)).map((s) => path.join(s, "World of Warcraft"))]),
  );
  const found = await Promise.all(roots.flat().map(clientsIn));
  const running = await runningClient();
  const all = [...(running ? [running] : []), ...found.flat()];
  const seen = new Set<string>();
  return all.filter((p) => {
    const k = p.toLowerCase();
    return !seen.has(k) && !!seen.add(k);
  });
}
