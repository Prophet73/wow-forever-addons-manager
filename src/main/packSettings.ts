// Takes one character's interface settings for a pack file and lays them onto another character,
// possibly on someone else's computer.

import fs from "node:fs";
import path from "node:path";
import type { PackFileContents, PackFiles } from "./packFile";
import { copyProfileKeys, dropProfileKeys } from "./profileKeys";
import { NEEDTOKNOW_FILE, renameProfiles } from "./timers/needToKnow";
import { accountDir, backupBeforeWrite, charDir, GROUP_FILES, listCharacters } from "./wtf";
import { copyXPerlPositions, xperlName } from "./xperlPositions";

/** Character files that travel whole: everything but the game options, which depend on the PC. */
const CHARACTER_FILES = [GROUP_FILES.addonList, GROUP_FILES.layout, GROUP_FILES.chat, GROUP_FILES.bindings, GROUP_FILES.macros].flat();

/** Saved data that is private or not a setting: whispers, error logs, recorded fights, quest progress. */
const NOT_SETTINGS = new Set(["WhisperMessenger", "!BugGrabber", "BugSack", "Details_DataStorage", "CatQuest"]);

/** Per-character files that hold chat history rather than settings (Prat's settings are account-wide). */
const PRIVATE_CHARACTER_FILES = new Set(["Prat-3.0"]);

/**
 * Game options that make up the action bar setup: which extra bars are shown and whether they are
 * locked. Only these travel from config-cache.wtf; the rest of it depends on the PC.
 */
const PANEL_CVARS = new Set(["enableMultiActionBars", "lockActionBars", "alwaysShowActionBars"]);
const CVAR_FILE = "config-cache.wtf";

const read = (file: string): string | null => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);

/**
 * The character's layout, bindings, macros, chat and addon list, plus the saved settings of the
 * given addon folders (a SavedVariables file is named after its addon folder).
 */
export function collectSettings(gamePath: string, charId: string, addonFolders: string[]): Pick<PackFileContents, "from" | "files"> {
  const cdir = charDir(gamePath, charId);
  const account = charId.split("/")[0];
  const adir = accountDir(gamePath, account);
  const files: PackFiles = {};
  // The sender's other characters on this account: their names stay out of the shared file.
  const otherNames = listCharacters(gamePath)
    .filter((c) => c.account === account && c.id !== charId)
    .map((c) => c.name.split("-")[0]);
  for (const f of CHARACTER_FILES) {
    const text = read(path.join(cdir, f));
    if (text !== null) files[`character/${f}`] = text;
  }
  const charPanels = panelCvars(read(path.join(cdir, CVAR_FILE)));
  if (charPanels) files[`character/${CVAR_FILE}`] = charPanels;
  const accountPanels = panelCvars(read(path.join(adir, CVAR_FILE)));
  if (accountPanels) files[`account/${CVAR_FILE}`] = accountPanels;
  // Bindings saved for the whole account instead of the character.
  const accountBindings = !files["character/bindings-cache.wtf"] && read(path.join(adir, "bindings-cache.wtf"));
  if (accountBindings) files["account/bindings-cache.wtf"] = accountBindings;
  for (const folder of new Set(addonFolders)) {
    if (NOT_SETTINGS.has(folder)) continue;
    const sv = `SavedVariables/${folder}.lua`;
    const own = !PRIVATE_CHARACTER_FILES.has(folder) && read(path.join(cdir, sv));
    if (own) files[`character/${sv}`] = own;
    const shared = read(path.join(adir, sv));
    if (shared !== null) files[`account/${sv}`] = dropProfileKeys(shared, otherNames);
  }
  return { from: charId.split("/")[2], files };
}

/**
 * Writes the pack's settings onto `charId` after a restorable backup, then hands the profiles,
 * X-Perl positions and NeedToKnow profiles kept under the source character's name to this one.
 * Account-wide settings files are replaced whole.
 */
export async function applySettings(gamePath: string, charId: string, pack: Pick<PackFileContents, "from" | "files">): Promise<number> {
  const [account, , folder] = charId.split("/");
  const cdir = charDir(gamePath, charId);
  const adir = accountDir(gamePath, account);
  const entries = Object.entries(pack.files).map(([p, text]) => {
    const [scope, ...rest] = p.split("/");
    return { scope, rel: rest.join("/"), text };
  });
  const charFiles = entries.filter((e) => e.scope === "character").map((e) => e.rel);
  const accountFiles = entries.filter((e) => e.scope === "account").map((e) => e.rel);

  await backupBeforeWrite(
    gamePath,
    [charId],
    charFiles.map((f) => f.split("/").join(path.sep)),
    accountFiles.filter((f) => fs.existsSync(path.join(adir, f))).map((f) => `${account}/${f}`),
  );

  const from = xperlName(pack.from);
  const to = xperlName(folder);
  for (const e of entries) {
    const file = path.join(e.scope === "character" ? cdir : adir, ...e.rel.split("/"));
    let text = e.text;
    if (e.rel === CVAR_FILE) text = mergeCvars(read(file) ?? "", panelCvars(text) ?? "");
    else if (e.scope === "account") text = copyProfileKeys(text, from, to);
    if (e.rel === `SavedVariables/${NEEDTOKNOW_FILE}.lua` && e.scope === "character") text = renameProfiles(text, to);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, "utf8");
  }
  if (accountFiles.includes("SavedVariables/XPerlForever.lua")) copyXPerlPositions(adir, pack.from, [folder]);
  return entries.length;
}

const cvarName = (line: string) => /^SET (\S+) /.exec(line)?.[1];

/** The PANEL_CVARS lines of a config-cache.wtf, or null if it sets none of them. */
function panelCvars(text: string | null): string | null {
  const lines = (text ?? "").split(/\r?\n/).filter((l) => PANEL_CVARS.has(cvarName(l) ?? ""));
  return lines.length ? lines.join("\r\n") + "\r\n" : null;
}

/** `text` with the CVars set in `cvars` overwritten or added, everything else kept as it is. */
function mergeCvars(text: string, cvars: string): string {
  const incoming = new Map(cvars.split(/\r?\n/).filter(cvarName).map((l) => [cvarName(l)!, l]));
  const lines = text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const n = cvarName(l);
      if (!n || !incoming.has(n)) return l;
      const replaced = incoming.get(n)!;
      incoming.delete(n);
      return replaced;
    });
  return [...lines, ...incoming.values()].join("\r\n") + "\r\n";
}
