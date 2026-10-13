// Ready-made packs published in the repository's packs/ folder. The list is a JSON file there,
// so a new pack goes live by adding a file, without a new app release.

import type { FeaturedPack } from "../shared/types";
import type { Language } from "../shared/i18n";
import { t } from "../shared/i18n";
import { download } from "./installer";
import { USER_AGENT } from "./providers/types";

const BASE = "https://raw.githubusercontent.com/Prophet73/wow-forever-addons-manager/release/packs/";

interface IndexEntry {
  file: string;
  author: string;
  addons: number;
  name: Record<Language, string>;
  description: Record<Language, string>;
}

/** File names come from the network, so only plain names ending in .fapack are accepted. */
const SAFE_FILE = /^[\w.-]+\.fapack$/;

export async function listFeaturedPacks(language: Language): Promise<FeaturedPack[]> {
  const res = await fetch(`${BASE}index.json`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(t("Не удалось загрузить готовые сборки (HTTP {status}).", { status: res.status }));
  const entries = (await res.json()) as IndexEntry[];
  return entries
    .filter((e) => SAFE_FILE.test(e.file))
    .map((e) => ({
      file: e.file,
      author: e.author,
      addons: e.addons,
      name: e.name[language] ?? e.name.ru,
      description: e.description[language] ?? e.description.ru,
    }));
}

/** Downloads one of the listed pack files to `dest`. */
export async function downloadFeaturedPack(file: string, dest: string): Promise<void> {
  if (!SAFE_FILE.test(file)) throw new Error(t("Неверное имя файла: {sv}", { sv: file }));
  await download(BASE + file, dest, 0, () => {});
}
