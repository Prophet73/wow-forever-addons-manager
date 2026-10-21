// X-Perl keeps frame positions in the account-wide SavedVariables, keyed realm → character name,
// so copying a character folder alone leaves the target with its old frame positions.
// The realm is the game's realm name ("CAMWOW EU4 Realm 4 PvP"), which the WTF folder doesn't
// show, so it is learned from the entries X-Perl itself has written for the character.

import fs from "node:fs";
import path from "node:path";
import { t } from "../shared/i18n";

/** Relative to WTF\Account\<account>, with "/" separators as backups record it. */
const FILE = "SavedVariables/XPerlForever.lua";
const ROOT = `["savedPositions"] = {`;

/** X-Perl's key for a character: the WTF folder name up to the first "-". */
export const xperlName = (folder: string): string => folder.split("-")[0];

const key = (name: string) => `["${name}"] = {`;

/** The X-Perl file (account-relative) when it has positions for `fromFolder`, else null. */
export function xperlPositionsFile(accountDir: string, fromFolder: string): string | null {
  try {
    const text = fs.readFileSync(path.join(accountDir, FILE), "utf8");
    return text.includes(key(xperlName(fromFolder))) ? FILE : null;
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
  throw new Error(t("Файл X-Perl повреждён."));
}

/** The direct child tables of the block opened at `start`: their name and first line. */
function children(lines: string[], start: number): { name: string; at: number }[] {
  const out: { name: string; at: number }[] = [];
  const end = blockEnd(lines, start);
  for (let i = start + 1; i < end; i++) {
    const m = /^\["(.*)"\] = \{$/.exec(lines[i]);
    if (!m) continue;
    out.push({ name: m[1], at: i });
    i = blockEnd(lines, i);
  }
  return out;
}

/** Realms whose position table has an entry for `name`. */
function realmsOf(lines: string[], name: string): string[] {
  const root = lines.indexOf(ROOT);
  if (root < 0) return [];
  return children(lines, root)
    .filter((r) => children(lines, r.at).some((c) => c.name === name))
    .map((r) => r.name);
}

/** Realms in which X-Perl has saved positions for the character in `folder`. */
export function xperlRealms(accountDir: string, folder: string): string[] {
  try {
    return realmsOf(fs.readFileSync(path.join(accountDir, FILE), "utf8").split(/\r?\n/), xperlName(folder));
  } catch {
    return [];
  }
}

/** Puts `name`'s table with `body` under `realm`, replacing the old one or adding the realm. */
function place(lines: string[], realm: string, name: string, body: string[]): void {
  const entry = [key(name), ...body];
  const root = lines.indexOf(ROOT);
  const table = children(lines, root).find((r) => r.name === realm);
  if (!table) {
    lines.splice(root + 1, 0, key(realm), ...entry, "},");
    return;
  }
  const old = children(lines, table.at).find((c) => c.name === name);
  if (old) lines.splice(old.at, blockEnd(lines, old.at) - old.at + 1, ...entry);
  else lines.splice(table.at + 1, 0, ...entry);
}

/**
 * Gives each target the source character's saved X-Perl positions in `realms` (the realms the
 * target plays on), or else in every realm where X-Perl already has an entry for the target.
 * A target with neither gets them in the source's realm.
 */
export function copyXPerlPositions(accountDir: string, fromFolder: string, toFolders: string[], realms: string[] = []): void {
  const file = path.join(accountDir, FILE);
  const text = fs.readFileSync(file, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(eol);

  const from = xperlName(fromFolder);
  const sourceRealm = realmsOf(lines, from)[0];
  if (sourceRealm === undefined) return;
  const realmTable = children(lines, lines.indexOf(ROOT)).find((r) => r.name === sourceRealm)!;
  const source = children(lines, realmTable.at).find((c) => c.name === from)!;
  const body = lines.slice(source.at + 1, blockEnd(lines, source.at) + 1);

  for (const name of toFolders.map(xperlName)) {
    const targetRealms = realms.length ? realms : realmsOf(lines, name);
    for (const realm of targetRealms.length ? targetRealms : [sourceRealm]) place(lines, realm, name, body);
  }
  fs.writeFileSync(file, lines.join(eol), "utf8");
}
