import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppUpdate } from "../shared/types";
import { download } from "./installer";
import { USER_AGENT } from "./providers/types";
import { t } from "../shared/i18n";

const REPO = "Prophet73/wow-forever-addons-manager";
/** Every release ships the exe under this name, so the README's download link never changes. */
const ASSET = "ForeverAddons-portable.exe";

/**
 * The latest release on GitHub, if it is newer than the running version. Read from the website's
 * releases/latest redirect, not the API: the API allows 60 requests an hour per IP, which a VPN or
 * shared IP uses up, and then the update banner silently never shows.
 */
export async function findAppUpdate(current: string): Promise<AppUpdate | null> {
  const headers = { "User-Agent": USER_AGENT };
  const latest = await fetch(`https://github.com/${REPO}/releases/latest`, { method: "HEAD", redirect: "manual", headers });
  const pageUrl = latest.headers.get("location") ?? "";
  const tag = /\/releases\/tag\/([^/?#]+)$/.exec(pageUrl)?.[1];
  if (!tag) throw new Error(t("GitHub не ответил (HTTP {status}). Попробуй позже.", { status: latest.status }));
  const version = decodeURIComponent(tag).replace(/^v/, "");
  if (compareVersions(version, current) <= 0) return null;
  const downloadUrl = `https://github.com/${REPO}/releases/download/${tag}/${ASSET}`;
  // The size lets the download be checked for completeness before it replaces the running exe.
  const asset = await fetch(downloadUrl, { method: "HEAD", headers });
  const size = Number(asset.headers.get("content-length"));
  if (!asset.ok || !size) return null;
  return { version, pageUrl, downloadUrl, size, progress: null };
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
 *
 * The script uses cmd built-ins only: a detached cmd has no console, and any console program it
 * started (`timeout`, `chcp`) would pop up a window of its own. So it retries the move in a tight
 * loop (a failed move takes about 6 ms, so the cap is roughly a minute), and the paths, which may contain
 * Cyrillic, come in through the environment instead of the OEM-encoded script.
 */
export async function installAppUpdate(update: AppUpdate, exe: string, onProgress: (fraction: number | null) => void): Promise<void> {
  const next = `${exe}.new`;
  await download(update.downloadUrl, next, update.size, (_stage, f) => onProgress(f));
  const script = path.join(os.tmpdir(), "forever-addons-update.cmd");
  const lines = [
    "@echo off",
    "set n=0",
    ":wait",
    "set /a n+=1",
    "if %n% gtr 10000 exit /b 1",
    'move /y "%FA_NEXT%" "%FA_EXE%" >nul 2>&1 || goto wait',
    'start "" "%FA_EXE%"',
    'del "%~f0"',
  ];
  fs.writeFileSync(script, lines.join("\r\n") + "\r\n", "utf8");
  const env = { ...process.env, FA_NEXT: next, FA_EXE: exe };
  spawn("cmd.exe", ["/c", script], { detached: true, stdio: "ignore", windowsHide: true, env }).unref();
}
