// A .fapack file carries a pack together with one character's interface settings, so a friend
// gets the addons and the layout in one go. It is gzipped JSON: the files are Lua and plain text.

import fs from "node:fs";
import zlib from "node:zlib";
import { decodePack, encodePack, type DecodedPack } from "./packs";
import { t } from "../shared/i18n";

const FORMAT = "forever-addons-pack";
const VERSION = 1;
/** A real pack is a few MB unpacked; anything far beyond that is not one. */
const MAX_UNPACKED = 64 * 1024 * 1024;

/** Paths inside the pack: "character/<file>" for the character folder, "account/<file>" for WTF\Account\<acc>. */
export type PackFiles = Record<string, string>;

export interface PackFileContents extends DecodedPack {
  /** WTF folder name of the character the settings were taken from, e.g. "Arthas-Lordaeron". */
  from: string;
  files: PackFiles;
}

interface Payload {
  format: typeof FORMAT;
  v: number;
  /** The pack itself, as a share code: reuses its validation on the way in. */
  code: string;
  from: string;
  files: PackFiles;
}

const SV_NAME = "[\\w!+ -][\\w!.+ -]*\\.lua";
const CHARACTER_FILE = new RegExp(
  `^character/(AddOns\\.txt|layout-local\\.txt|edit-mode-cache-character\\.txt|chat-cache\\.txt|bindings-cache\\.wtf|click-bindings-cache\\.txt|macros-cache\\.txt|config-cache\\.wtf|SavedVariables/${SV_NAME})$`,
);
const ACCOUNT_FILE = new RegExp(`^account/(bindings-cache\\.wtf|config-cache\\.wtf|SavedVariables/${SV_NAME})$`);

export function writePackFile(file: string, contents: PackFileContents): void {
  const { from, files, ...pack } = contents;
  const payload: Payload = { format: FORMAT, v: VERSION, code: encodePack(pack), from, files };
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(payload)));
}

/** Reads a pack file. Everything in it is untrusted input from someone else. */
export function readPackFile(file: string): PackFileContents {
  let payload: Partial<Payload>;
  try {
    payload = JSON.parse(zlib.gunzipSync(fs.readFileSync(file), { maxOutputLength: MAX_UNPACKED }).toString("utf8"));
  } catch {
    throw new Error(t("Это не файл сборки Forever Addons или он повреждён."));
  }
  if (payload.format !== FORMAT) throw new Error(t("Это не файл сборки Forever Addons."));
  if (payload.v !== VERSION) throw new Error(t("Файл сборки из более новой версии Forever Addons. Обнови программу."));
  const files: PackFiles = {};
  for (const [p, text] of Object.entries(payload.files ?? {})) {
    if (typeof text !== "string" || !(CHARACTER_FILE.test(p) || ACCOUNT_FILE.test(p))) throw new Error(t("В файле сборки лишний файл: {p}", { p: p }));
    files[p] = text;
  }
  const from = String(payload.from ?? "");
  if (!/^[^\\/:]+$/.test(from)) throw new Error(t("Файл сборки повреждён."));
  return { ...decodePack(String(payload.code ?? "")), from, files };
}
