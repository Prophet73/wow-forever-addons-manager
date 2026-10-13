import { execFile } from "node:child_process";
import path from "node:path";

const GAME_EXES = ["wowb.exe", "wow.exe", "wowclassic.exe", "wowclassicb.exe", "wowt.exe"];

/** True if a WoW client is running. Windows only; elsewhere it reports false. */
export function isGameRunning(): Promise<boolean> {
  if (process.platform !== "win32") return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile("tasklist", ["/fo", "csv", "/nh"], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve(false);
      const names = stdout
        .split(/\r?\n/)
        .map((l) => l.split('","')[0]?.replace(/^"/, "").toLowerCase())
        .filter(Boolean);
      resolve(names.some((n) => GAME_EXES.includes(n)));
    });
  });
}

export function addonsDir(gamePath: string): string {
  return path.join(gamePath, "Interface", "AddOns");
}

/** Working folder kept next to the game so moves stay on the same drive (renames, not copies). */
export function workDir(gamePath: string): string {
  return path.join(gamePath, ".forever-addons");
}
