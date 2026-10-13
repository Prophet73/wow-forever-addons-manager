// Player classes, by the game's class file token (UnitClass second return value).

import { t } from "./i18n";

export const WOW_CLASSES = ["WARRIOR", "PALADIN", "HUNTER", "ROGUE", "PRIEST", "SHAMAN", "MAGE", "WARLOCK", "DRUID"] as const;

export type WowClass = (typeof WOW_CLASSES)[number];

const CLASS_LABELS: Record<WowClass, string> = {
  WARRIOR: "Воин",
  PALADIN: "Паладин",
  HUNTER: "Охотник",
  ROGUE: "Разбойник",
  PRIEST: "Жрец",
  SHAMAN: "Шаман",
  MAGE: "Маг",
  WARLOCK: "Чернокнижник",
  DRUID: "Друид",
};

/** The class name in the current language. */
export function classLabel(c: WowClass): string {
  return t(CLASS_LABELS[c]);
}

/** The game's own class colors (RAID_CLASS_COLORS). */
export const CLASS_COLORS: Record<WowClass, string> = {
  WARRIOR: "#c69b6d",
  PALADIN: "#f48cba",
  HUNTER: "#aad372",
  ROGUE: "#fff468",
  PRIEST: "#ffffff",
  SHAMAN: "#0070dd",
  MAGE: "#3fc7eb",
  WARLOCK: "#8788ee",
  DRUID: "#ff7c0a",
};

export function isWowClass(v: unknown): v is WowClass {
  return typeof v === "string" && (WOW_CLASSES as readonly string[]).includes(v);
}
