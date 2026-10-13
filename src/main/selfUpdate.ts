import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppUpdate } from "../shared/types";
import { download } from "./installer";
import { USER_AGENT } from "./providers/types";

const REPO = "Prophet73/wow-forever-addons-manager";
/** Every release ships the exe under this name, so the README's download link never changes. */
const ASSET = "ForeverAddons-portable.exe";

/** The latest release on GitHub, if it is newer than the running version. */
export async function findAppUpdate(current: string): Promise<AppUpdate | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub не ответил (HTTP ${res.status}). Попробуй позже.`);
  const r = (await res.json()) as { tag_name: string; html_url: string; assets: { name: string; browser_download_url: string; size: number }[] };
  const version = r.tag_name.replace(/^v/, "");
  const asset = r.assets.find((a) => a.name === ASSET);
  if (!asset || compareVersions(version, current) <= 0) return null;
  return { version, pageUrl: r.html_url, downloadUrl: asset.browser_download_url, size: asset.size, progress: null };
}

/** Semver order: "0.2.0" > "0.1.0", and a release beats its own pre-release, "0.1.0" > "0.1.0-beta". */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre = ""] = v.split(/-(.*)/s);
    return { nums: core.split(".").map((n) => Number(n) || 0), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre.localeCompare(y.pre, "en", { numeric: true });
}

/**
 * Downloads the new exe next to the running one and swaps it in once the app has quit. A running
 * exe can't be overwritten, so a detached script retries the move for a minute, then starts the
 * new version. The caller quits the app right after this returns.
 */
export async function installAppUpdate(update: AppUpdate, exe: string, onProgress: (fraction: number | null) => void): Promise<void> {
  const next = `${exe}.new`;
  await download(update.downloadUrl, next, update.size, (_stage, f) => onProgress(f));
  const script = path.join(os.tmpdir(), "forever-addons-update.cmd");
  const lines = [
    "@echo off",
    // The exe path may contain Cyrillic; the script is written as UTF-8.
    "chcp 65001 >nul",
    "set n=0",
    ":wait",
    "set /a n+=1",
    "if %n% gtr 60 exit /b 1",
    "timeout /t 1 /nobreak >nul",
    `move /y "${next}" "${exe}" >nul 2>&1 || goto wait`,
    `start "" "${exe}"`,
    'del "%~f0"',
  ];
  fs.writeFileSync(script, lines.join("\r\n") + "\r\n", "utf8");
  spawn("cmd.exe", ["/c", script], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}
