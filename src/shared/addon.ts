import type { AddonRef, TrackedAddon } from "./types";

/** Unique key for an addon: "curseforge:1715196", "github:owner/repo". */
export function addonKey(ref: AddonRef): string {
  return `${ref.provider}:${ref.id}`;
}

/** A newer compatible file than the installed one is available. */
export function hasUpdate(a: TrackedAddon): boolean {
  return !!a.latest && a.latest.fileId !== a.installed?.fileId;
}

/** Needs an install or an update. */
export function needsAction(a: TrackedAddon): boolean {
  return hasUpdate(a) || !a.installed;
}

export const PROVIDER_LABEL: Record<AddonRef["provider"], string> = {
  curseforge: "CurseForge",
  github: "GitHub",
};
