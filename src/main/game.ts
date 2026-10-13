import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const GAME_EXES = ["wowb.exe", "wow.exe", "wowclassic.exe", "wowclassicb.exe", "wowt.exe"];

function run(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    // Get-Process exits with 1 when some of the names aren't running, yet prints the rest.
    execFile(cmd, args, { windowsHide: true, timeout: 10000 }, (err, stdout) => resolve(stdout || (err ? null : "")));
  });
}

/**
 * True if a WoW client from this game folder is running. Another client (retail, Classic) holds
 * no files here, so it doesn't count. tasklist is cheap but has no paths, so PowerShell is asked
 * for them only when some WoW client is up. Windows only; elsewhere it reports false.
 */
export async function isGameRunning(gamePath: string): Promise<boolean> {
  if (process.platform !== "win32" || !gamePath) return false;
  const list = await run("tasklist", ["/fo", "csv", "/nh"]);
  const names = (list ?? "").split(/\r?\n/).map((l) => l.split('","')[0]?.replace(/^"/, "").toLowerCase());
  if (!names.some((n) => GAME_EXES.includes(n))) return false;
  const procNames = GAME_EXES.map((e) => path.parse(e).name).join(",");
  const paths = await run("powershell", ["-NoProfile", "-Command", `Get-Process -Name ${procNames} -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }`]);
  // Without paths (PowerShell failed, or a client run as admin) stay safe and assume it's this game.
  const exes = (paths ?? "").split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
  if (exes.length === 0) return true;
  const dir = longPath(gamePath);
  return exes.some((exe) => longPath(path.dirname(exe)) === dir);
}

/** Comparable form of a folder: Windows may report it in 8.3 form ("QQ_PRO~1") or in full. */
function longPath(p: string): string {
  try {
    return fs.realpathSync.native(p).toLowerCase();
  } catch {
    return path.resolve(p).toLowerCase();
  }
}

export function addonsDir(gamePath: string): string {
  return path.join(gamePath, "Interface", "AddOns");
}

/** Working folder kept next to the game so moves stay on the same drive (renames, not copies). */
export function workDir(gamePath: string): string {
  return path.join(gamePath, ".forever-addons");
}
