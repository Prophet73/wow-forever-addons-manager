// Edits NeedToKnow Forever's per-character SavedVariables text in place.
//
// The file holds the profile twice (NeedToKnowForever_CharSettings and the legacy
// NeedToKnow_CharSettings); both get the same groups. Existing group and bar tables are used as
// templates, so every field the addon expects stays present. Tables in this file open on a line
// ending with "{" and close on a line starting with "}".

import type { TimerBar, TimerGroup } from "./presets";

export const NEEDTOKNOW_FILE = "NeedToKnow_Forever";

/** NeedToKnow supports exactly four groups; the ones a preset doesn't use stay disabled. */
const GROUP_COUNT = 4;
const GROUP_WIDTH = 222;

function blockEnd(lines: string[], start: number): number {
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    if (lines[i].endsWith("{")) depth++;
    if (lines[i].startsWith("}")) depth--;
    if (depth === 0) return i;
  }
  throw new Error(`Файл NeedToKnow повреждён: таблица на строке ${start + 1} не закрыта.`);
}

function childTables(lines: string[], start: number, end: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = start + 1; i < end; i++) {
    if (lines[i] !== "{") continue;
    const e = blockEnd(lines, i);
    out.push([i, e]);
    i = e;
  }
  return out;
}

function setField(block: string, key: string, value: string): string {
  const re = new RegExp(`^\\["${key}"\\] = .*,$`, "m");
  if (!re.test(block)) throw new Error(`В шаблоне NeedToKnow нет поля ${key}.`);
  return block.replace(re, () => `["${key}"] = ${value},`);
}

function setTable(block: string, key: string, rows: string[], eol: string): string {
  const re = new RegExp(`\\["${key}"\\] = \\{[\\s\\S]*?\\n\\},`);
  return block.replace(re, () => [`["${key}"] = {`, ...rows, "},"].join(eol));
}

function renderBar(template: string, bar: TimerBar, eol: string): string {
  let t = template;
  t = setField(t, "AuraName", JSON.stringify(bar.aura));
  t = setField(t, "Unit", JSON.stringify(bar.unit));
  t = setField(t, "BuffOrDebuff", JSON.stringify(bar.type));
  t = setField(t, "OnlyMine", String(bar.onlyMine));
  t = setField(t, "Enabled", "true");
  t = setField(t, "blink_enabled", "false");
  t = setField(t, "show_text_user", JSON.stringify(bar.label));
  const [r, g, b] = bar.color;
  return setTable(t, "BarColor", ['["a"] = 1,', `["r"] = ${r},`, `["g"] = ${g},`, `["b"] = ${b},`], eol);
}

function renderGroup(template: string, barTemplate: string, group: TimerGroup, enabled: boolean, eol: string): string {
  const tl = template.split(eol);
  const barsAt = tl.indexOf('["Bars"] = {');
  const bars = ['["Bars"] = {', ...group.bars.map((b) => renderBar(barTemplate, b, eol)), "},"];
  let t = [...tl.slice(0, barsAt), ...bars, ...tl.slice(blockEnd(tl, barsAt) + 1)].join(eol);
  t = setField(t, "Enabled", String(enabled));
  t = setField(t, "Scale", "1");
  t = setField(t, "Width", String(GROUP_WIDTH));
  t = setField(t, "direction", '"up"');
  t = setField(t, "NumberBars", String(group.bars.length));
  return setTable(t, "Position", ['"BOTTOM",', '"BOTTOM",', `${group.pos[0]},`, `${group.pos[1]},`], eol);
}

/** Replaces every profile's groups with the given ones (padded to four with disabled copies). */
export function applyTimerGroups(text: string, groups: TimerGroup[]): string {
  if (groups.length === 0 || groups.length > GROUP_COUNT) throw new Error("В NeedToKnow от 1 до 4 групп.");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(eol);
  const padded: [TimerGroup, boolean][] = groups.map((g) => [g, true]);
  while (padded.length < GROUP_COUNT) padded.push([groups[0], false]);

  const starts = lines.flatMap((l, i) => (l === '["Groups"] = {' ? [i] : [])).reverse();
  if (starts.length === 0) throw new Error("В файле NeedToKnow нет групп: зайди этим персонажем в игру с включённым NeedToKnow.");
  // From the bottom up, so earlier line numbers stay valid while splicing.
  for (const start of starts) {
    const end = blockEnd(lines, start);
    const existing = childTables(lines, start, end);
    if (existing.length === 0) throw new Error("В профиле NeedToKnow нет ни одной группы.");
    const [gs, ge] = existing[0];
    const barsLine = lines.indexOf('["Bars"] = {', gs);
    const firstBar = childTables(lines, barsLine, blockEnd(lines, barsLine))[0];
    if (!firstBar) throw new Error("В группе NeedToKnow нет баров для шаблона.");
    const groupTemplate = lines.slice(gs, ge + 1).join(eol);
    const barTemplate = lines.slice(firstBar[0], firstBar[1] + 1).join(eol);
    const body = ['["Groups"] = {', ...padded.map(([g, on]) => renderGroup(groupTemplate, barTemplate, g, on, eol)), "},"];
    lines.splice(start, end - start + 1, ...body.join(eol).split(eol));
  }
  return lines.join(eol);
}

/** After copying the file to another character, names its profiles after that character. */
export function renameProfiles(text: string, characterName: string): string {
  return text.replace(/^\["name"\] = "[^"-]*-([^"]*)",$/gm, (_m, server: string) => `["name"] = ${JSON.stringify(`${characterName}-${server}`)},`);
}
