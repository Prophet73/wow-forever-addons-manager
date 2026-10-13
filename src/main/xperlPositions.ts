// X-Perl keeps frame positions in the account-wide SavedVariables, keyed realm → character name,
// so copying a character folder alone leaves the target with its old frame positions.

import fs from "node:fs";
import path from "node:path";

/** Relative to WTF\Account\<account>, with "/" separators as backups record it. */
const FILE = "SavedVariables/XPerlForever.lua";

/** X-Perl's key for a character: the WTF folder name up to the first "-". */
export const xperlName = (folder: string): string => folder.split("-")[0];

/** The X-Perl file (account-relative) when it has positions for `fromFolder`, else null. */
export function xperlPositionsFile(accountDir: string, fromFolder: string): string | null {
  try {
    const text = fs.readFileSync(path.join(accountDir, FILE), "utf8");
    return text.includes(`["${xperlName(fromFolder)}"] = {`) ? FILE : null;
  } catch {
    return null;
  }
}

function blockEnd(lines: string[], start: number): number {
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    if (lines[i].endsWith("{")) depth++;
    if (lines[i].startsWith("}")) depth--;
    if (depth === 0) return i;
  }
  throw new Error("Файл X-Perl повреждён.");
}

/** Gives each target the source character's saved X-Perl positions, within the same realm table. */
export function copyXPerlPositions(accountDir: string, fromFolder: string, toFolders: string[]): void {
  const file = path.join(accountDir, FILE);
  const text = fs.readFileSync(file, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(eol);

  const sourceKey = `["${xperlName(fromFolder)}"] = {`;
  const start = lines.indexOf(sourceKey);
  if (start < 0) return;
  const body = lines.slice(start + 1, blockEnd(lines, start) + 1);
  for (const name of toFolders.map(xperlName)) {
    const entry = [`["${name}"] = {`, ...body];
    const at = lines.indexOf(entry[0]);
    if (at >= 0) lines.splice(at, blockEnd(lines, at) - at + 1, ...entry);
    else lines.splice(lines.indexOf(sourceKey), 0, ...entry);
  }
  fs.writeFileSync(file, lines.join(eol), "utf8");
}
