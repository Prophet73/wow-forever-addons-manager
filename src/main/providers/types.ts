import type { ProviderId, ReleaseType, RemoteFile } from "../../shared/types";

export interface FileQuery {
  /** CurseForge gameVersionTypeId of the flavor (88568 = WoW Forever). */
  flavorTypeId: number;
  maxReleaseType: ReleaseType;
}

export interface ResolvedAddon {
  id: string;
  /** Null when the source can't tell (CurseForge without an API key). */
  name: string | null;
  url: string | null;
  iconUrl: string | null;
  /** Category names at the source; empty when it has none (GitHub). */
  categories: string[];
}

/** An addon source. Ids are provider-specific strings: "1715196", "owner/repo". */
export interface Provider {
  readonly id: ProviderId;
  /**
   * Recognises user input (an id or URL). Returns null if the input isn't for this provider;
   * throws if it is but the addon can't be found.
   */
  resolve(input: string): Promise<ResolvedAddon | null>;
  /** Name, page and icon for an id that's already known. Null if the source can't say. */
  info(id: string): Promise<ResolvedAddon | null>;
  /** Newest file compatible with the flavor and allowed release type. */
  latestFile(id: string, q: FileQuery): Promise<RemoteFile | null>;
  downloadUrl(id: string, file: RemoteFile): Promise<string>;
}

export const USER_AGENT = "ForeverAddons/0.1";

/** "CatQuest_Voices-0.5.0" -> "CatQuest_Voices". Used as a name when project info is unavailable. */
export function nameFromFile(file: RemoteFile): string {
  const base = file.displayName || file.fileName.replace(/\.zip$/i, "");
  return base.replace(/[-_ ]v?\d[\w.+-]*$/i, "").trim() || base;
}
