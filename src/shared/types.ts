// Types shared between the main process and the renderer.

import type { WowClass } from "./classes";

/** 1 = release, 2 = beta, 3 = alpha (CurseForge numbering). GitHub pre-releases count as beta. */
export type ReleaseType = 1 | 2 | 3;

export type ProviderId = "curseforge" | "github";

/** Identifies an addon at its source: CurseForge project id ("1715196") or GitHub repo ("owner/repo"). */
export interface AddonRef {
  provider: ProviderId;
  id: string;
}

export interface Settings {
  /** Game client folder, e.g. D:\Games\World of Warcraft\_classic_beta_ */
  gamePath: string;
  /** CurseForge gameVersionTypeId of the flavor to install. 88568 = WoW Forever. */
  flavorTypeId: number;
  /** Optional official CurseForge API key (console.curseforge.com). */
  curseforgeApiKey: string;
  /** Optional GitHub token; raises the API limit from 60 to 5000 requests per hour. */
  githubToken: string;
  /** Lowest release type allowed for updates: 1 = release only, 2 = +beta, 3 = +alpha. */
  maxReleaseType: ReleaseType;
  /** How many previous versions to keep per addon for rollback. */
  backupsToKeep: number;
  /** Check for updates when the app starts. */
  checkOnStartup: boolean;
}

export interface RemoteFile {
  /** CurseForge file id or GitHub release asset id. */
  fileId: number;
  displayName: string;
  fileName: string;
  fileLength: number;
  date: string;
  releaseType: ReleaseType;
  gameVersions: string[];
}

export interface TrackedAddon extends AddonRef {
  /** "curseforge:1715196", "github:owner/repo" — see addonKey(). */
  key: string;
  name: string;
  /** Project page. */
  url: string | null;
  /** Logo (CurseForge) or owner avatar (GitHub). Undefined = not looked up yet, null = none. */
  iconUrl?: string | null;
  /** CurseForge category names ("Unit Frames", "Combat"…). Undefined = not looked up yet. */
  categories?: string[];
  /** Installed file, or null if tracked but not installed yet. */
  installed: RemoteFile | null;
  /** Top-level folders this addon placed in Interface\AddOns. */
  folders: string[];
  /** Latest compatible file seen on the last check. */
  latest: RemoteFile | null;
  lastChecked: string | null;
  /** Per-addon override of Settings.maxReleaseType. */
  maxReleaseType?: ReleaseType;
  /** Versions available to roll back to, newest first. */
  backups: BackupEntry[];
}

export interface BackupEntry {
  file: RemoteFile;
  dir: string;
  createdAt: string;
}

/** A folder in Interface\AddOns that no tracked addon owns. */
export interface UntrackedFolder {
  folder: string;
  title: string;
  version: string;
  interface: string;
  curseProjectId: number | null;
}

export interface SearchResult {
  projectId: number;
  name: string;
  summary: string;
  author: string;
  downloads: number;
  thumbnailUrl: string | null;
  url: string | null;
  updated: string;
}

/** CurseForge sort fields used by the catalog. */
export type SearchSort = "popular" | "updated" | "newest" | "downloads" | "name";

export interface SearchParams {
  query: string;
  index: number;
  sort: SearchSort;
  categoryId: number | null;
}

export interface SearchPage {
  results: SearchResult[];
  total: number;
  index: number;
}

export interface Category {
  id: number;
  name: string;
  iconUrl: string | null;
}

export interface PackAddon extends AddonRef {
  name: string;
}

/** A named set of addons ("сборка") that can be applied or shared as a code. */
export interface Pack {
  id: string;
  name: string;
  description: string;
  addons: PackAddon[];
  createdAt: string;
  updatedAt: string;
  /** Interface settings that came with the pack file, taken from character `from`. */
  settings?: { from: string; files: number };
}

export interface ApplyPackResult {
  queued: number;
  alreadyInstalled: number;
  removed: number;
  failed: string[];
  /** Settings files written onto the chosen character. */
  settingsFiles: number;
}

export interface WtfCharacter {
  /** account/realm/character, relative to WTF\Account */
  id: string;
  account: string;
  realm: string;
  name: string;
  /** SavedVariables file names without .lua, e.g. "Details" */
  savedVariables: string[];
  /** Which copyable groups exist for this character. */
  has: Record<WtfGroup, boolean>;
  modified: string;
  /** Chosen by hand; the game keeps no class on disk. */
  wowClass: WowClass | null;
}

export type WtfGroup = "addonList" | "layout" | "chat" | "bindings" | "macros" | "gameSettings";

export interface WtfCopyRequest {
  from: string;
  to: string[];
  savedVariables: string[];
  groups: WtfGroup[];
}

export interface WtfBackup {
  id: string;
  createdAt: string;
  targets: string[];
  fileCount: number;
}

export interface WtfState {
  wtfExists: boolean;
  characters: WtfCharacter[];
  backups: WtfBackup[];
}

export type JobKind = "install" | "update" | "rollback" | "remove";

export interface Job {
  id: string;
  kind: JobKind;
  key: string;
  name: string;
  state: "queued" | "running" | "done" | "error";
  /** 0..1 while downloading/extracting, null when unknown. */
  progress: number | null;
  stage: string;
  error?: string;
}

/** A newer Forever Addons release on GitHub. */
export interface AppUpdate {
  version: string;
  pageUrl: string;
  downloadUrl: string;
  size: number;
  /** Download progress once the user pressed "update"; null before that. */
  progress: number | null;
}

export interface AppState {
  settings: Settings;
  addons: TrackedAddon[];
  untracked: UntrackedFolder[];
  jobs: Job[];
  gameRunning: boolean;
  addonsDirExists: boolean;
  /** Whether CurseForge accepts the configured API key. */
  keyStatus: "ok" | "none" | "rejected";
  packs: Pack[];
  appUpdate: AppUpdate | null;
}

export interface Api {
  getState(): Promise<AppState>;
  saveSettings(patch: Partial<Settings>): Promise<AppState>;
  /** Asks CurseForge again whether the saved key works. */
  verifyKey(): Promise<AppState>;
  /** Adds by CurseForge project id / URL or GitHub repo URL, then installs. */
  addAddon(input: string): Promise<AppState>;
  trackUntracked(curseProjectId: number): Promise<AppState>;
  checkUpdates(): Promise<AppState>;
  install(key: string): Promise<void>;
  updateAll(): Promise<void>;
  rollback(key: string): Promise<void>;
  remove(key: string): Promise<void>;
  setAddonChannel(key: string, maxReleaseType: ReleaseType | null): Promise<AppState>;
  /** Searches CurseForge for addons with a Forever build. Needs an API key. */
  search(params: SearchParams): Promise<SearchPage>;
  categories(): Promise<Category[]>;
  savePack(pack: Pick<Pack, "name" | "description" | "addons"> & { id?: string }): Promise<AppState>;
  deletePack(id: string): Promise<AppState>;
  /** With `charId`, also lays the pack's interface settings onto that character. */
  applyPack(id: string, removeOthers: boolean, charId: string | null): Promise<ApplyPackResult>;
  exportPack(id: string): Promise<string>;
  importPack(code: string): Promise<AppState>;
  /** Saves the pack plus the character's interface settings as a .fapack file; false if cancelled. */
  exportPackFile(id: string, charId: string): Promise<boolean>;
  /** Asks for a .fapack file and adds its pack; null if cancelled. */
  importPackFile(): Promise<AppState | null>;
  wtfState(): Promise<WtfState>;
  wtfCopy(req: WtfCopyRequest): Promise<WtfState>;
  wtfRestore(backupId: string): Promise<WtfState>;
  /** Remembers a character's class; null forgets it. */
  setCharacterClass(charId: string, wowClass: WowClass | null): Promise<WtfState>;
  /** Writes the character's class NeedToKnow timer preset, backing up the old file. */
  applyTimerPreset(charId: string): Promise<WtfState>;
  openExternal(url: string): Promise<void>;
  openAddonsFolder(): Promise<void>;
  /** Downloads the new version and restarts into it (or opens the release page when run from source). */
  installAppUpdate(): Promise<void>;
  /** Asks for a folder and returns the WoW Forever client folder in or around it. */
  pickGameFolder(): Promise<string | null>;
  /** Forever clients found on this computer without asking. */
  findGameFolders(): Promise<string[]>;
  onState(cb: (state: AppState) => void): () => void;
}
