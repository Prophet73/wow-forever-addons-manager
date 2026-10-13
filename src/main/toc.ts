import fs from "node:fs";
import path from "node:path";

export interface TocInfo {
  title: string;
  version: string;
  interface: string;
  curseProjectId: number | null;
}

/** Strips WoW UI escape codes such as |cffRRGGBB ... |r and |T...|t textures. */
function stripEscapes(s: string): string {
  return s
    .replace(/\|c[0-9a-fA-F]{8}/g, "")
    .replace(/\|r/g, "")
    .replace(/\|T[^|]*\|t/g, "")
    .trim();
}

/**
 * Reads the folder's .toc. Prefers <Folder>.toc, then a flavor-specific one
 * (e.g. Folder_Forever.toc), then any .toc.
 */
export function readToc(folderPath: string): TocInfo | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(folderPath).filter((f) => f.toLowerCase().endsWith(".toc"));
  } catch {
    return null;
  }
  if (entries.length === 0) return null;
  const folder = path.basename(folderPath).toLowerCase();
  const pick =
    entries.find((e) => e.toLowerCase() === `${folder}.toc`) ??
    entries.find((e) => e.toLowerCase().startsWith(folder)) ??
    entries[0];

  const text = fs.readFileSync(path.join(folderPath, pick), "utf8").replace(/^﻿/, "");
  const meta: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^##\s*([^:]+?)\s*:\s*(.*)$/.exec(line);
    if (m) meta[m[1].toLowerCase()] = m[2].trim();
  }
  const pid = Number(meta["x-curse-project-id"]);
  return {
    title: stripEscapes(meta["title"] ?? path.basename(folderPath)),
    version: meta["version"] ?? "",
    interface: meta["interface"] ?? "",
    curseProjectId: Number.isFinite(pid) && pid > 0 ? pid : null,
  };
}

export function listAddonFolders(addonsDir: string): string[] {
  try {
    return fs
      .readdirSync(addonsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch {
    return [];
  }
}
