import type { AddonRef, AppState } from "../shared/types";
import type { View } from "./Sidebar";
import { locale, t } from "../shared/i18n";

export const api = window.api;

export type Run = (fn: () => Promise<AppState | void>) => Promise<boolean>;

export interface ViewProps {
  state: AppState;
  run: Run;
  setView: (v: View) => void;
}

/** Project page of an addon at its source. */
export function addonPage(a: AddonRef & { url?: string | null }): string {
  if (a.url) return a.url;
  return a.provider === "github" ? `https://github.com/${a.id}` : `https://www.curseforge.com/projects/${a.id}`;
}

/** Electron prefixes IPC errors with "Error invoking remote method 'x': Error: ". */
export function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return t("{p0} ГБ", { p0: (bytes / 1024 ** 3).toFixed(1) });
  if (bytes >= 1024 ** 2) return t("{p0} МБ", { p0: (bytes / 1024 ** 2).toFixed(0) });
  return t("{p0} КБ", { p0: Math.max(1, Math.round(bytes / 1024)) });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short" });
}

export function formatAgo(iso: string | null | undefined): string {
  if (!iso) return t("никогда");
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return t("только что");
  if (s < 3600) return t("{p0} мин назад", { p0: Math.round(s / 60) });
  if (s < 86400) return t("{p0} ч назад", { p0: Math.round(s / 3600) });
  return formatDate(iso);
}

export function formatCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

/** "CatQuest-0.5.3" -> "0.5.3" */
export function versionOf(name: string | undefined): string {
  if (!name) return "—";
  const base = name.replace(/\.(zip|rar)$/i, "");
  const m = /[-_ ]v?(\d[\w.+-]*)$/i.exec(base);
  return m ? m[1] : base;
}

/** Stable hue from a string, for letter avatars. */
export function hueOf(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable; the preference just won't persist
  }
}
