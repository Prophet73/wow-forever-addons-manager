import type { ReleaseType, RemoteFile } from "../../shared/types";
import { USER_AGENT, type FileQuery, type Provider, type ResolvedAddon } from "./types";

const API = "https://api.github.com";
/** BigWigs packager flavor name for WoW Forever in release.json. */
const FOREVER_FLAVOR = "forever";
/** Words in asset names that mark a build for some other game version. */
const OTHER_FLAVOR = /[-_.](classic|vanilla|era|bcc|tbc|wrath|wotlk|cata|mists|mop|titan|mainline|retail)\b/i;

interface Asset {
  id: number;
  name: string;
  size: number;
  browser_download_url: string;
}

interface Release {
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string;
  assets: Asset[];
}

/** release.json written by the BigWigs packager next to the zips. */
interface ReleaseJson {
  releases?: { filename: string; nolib?: boolean; metadata?: { flavor: string; interface: number }[] }[];
}

/**
 * GitHub releases. Picks the zip meant for Forever: first from the packager's release.json,
 * then by "forever" in the asset name, then a single zip that isn't marked for another flavor.
 */
export class GitHub implements Provider {
  readonly id = "github" as const;
  /** Download URLs of the files returned by latestFile, so downloadUrl needs no request. */
  private urls = new Map<number, string>();

  constructor(private readonly getToken: () => string) {}

  async resolve(input: string): Promise<ResolvedAddon | null> {
    const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/i.exec(input.trim());
    if (!m) return null;
    return this.repoInfo(`${m[1]}/${m[2]}`);
  }

  async info(id: string): Promise<ResolvedAddon | null> {
    return this.repoInfo(id).catch(() => null);
  }

  private async repoInfo(fullName: string): Promise<ResolvedAddon> {
    const repo = await this.api<{ full_name: string; name: string; html_url: string; owner: { avatar_url: string } }>(`/repos/${fullName}`).catch(
      (e: Error) => {
        throw new Error(e.message.includes("404") ? `Репозиторий ${fullName} не найден на GitHub.` : e.message);
      },
    );
    return { id: repo.full_name, name: repo.name, url: repo.html_url, iconUrl: repo.owner.avatar_url, categories: [] };
  }

  async latestFile(id: string, q: FileQuery): Promise<RemoteFile | null> {
    const releases = await this.api<Release[]>(`/repos/${id}/releases?per_page=10`);
    for (const rel of releases) {
      if (rel.draft) continue;
      const releaseType = releaseTypeOf(rel);
      if (releaseType > q.maxReleaseType) continue;
      const asset = await this.pickAsset(rel);
      if (!asset) continue;
      this.urls.set(asset.id, asset.browser_download_url);
      return {
        fileId: asset.id,
        // Tags can be namespaced ("bundle/v12.0.4"); keep the last part.
        displayName: `${id.split("/")[1]}-${(rel.tag_name.split("/").pop() ?? rel.tag_name).replace(/^v(?=\d)/, "")}`,
        fileName: asset.name,
        fileLength: asset.size,
        date: rel.published_at,
        releaseType,
        gameVersions: [],
      };
    }
    return null;
  }

  async downloadUrl(id: string, file: RemoteFile): Promise<string> {
    const known = this.urls.get(file.fileId);
    if (known) return known;
    const asset = await this.api<Asset>(`/repos/${id}/releases/assets/${file.fileId}`);
    return asset.browser_download_url;
  }

  private async pickAsset(rel: Release): Promise<Asset | null> {
    const zips = rel.assets.filter((a) => a.name.toLowerCase().endsWith(".zip"));
    if (zips.length === 0) return null;

    const manifest = rel.assets.find((a) => a.name === "release.json");
    if (manifest) {
      const json = await this.download<ReleaseJson>(manifest.browser_download_url).catch(() => null);
      const entries = (json?.releases ?? []).filter((r) => r.metadata?.some((m) => m.flavor === FOREVER_FLAVOR));
      // Prefer the build with bundled libraries.
      entries.sort((a, b) => Number(!!a.nolib) - Number(!!b.nolib));
      for (const e of entries) {
        const asset = zips.find((z) => z.name === e.filename);
        if (asset) return asset;
      }
      // The packager lists every flavor it built, so no Forever entry means no Forever build.
      if (json?.releases?.length) return null;
    }

    const named = zips.find((z) => /forever/i.test(z.name));
    if (named) return named;
    const generic = zips.filter((z) => !OTHER_FLAVOR.test(z.name) && !/nolib/i.test(z.name));
    return generic.length === 1 ? generic[0] : null;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "User-Agent": USER_AGENT, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    const token = this.getToken().trim();
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }

  private async api<T>(path: string): Promise<T> {
    const res = await fetch(API + path, { headers: this.headers() });
    if (!res.ok) {
      if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
        const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
        const mins = Math.max(1, Math.ceil((reset - Date.now()) / 60000));
        throw new Error(`Лимит запросов к GitHub исчерпан, сбросится через ~${mins} мин. GitHub-токен в настройках поднимет лимит.`);
      }
      throw new Error(`GitHub: HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }

  /** Release assets are served from github.com, not the API, and don't count against the limit. */
  private async download<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}

function releaseTypeOf(rel: Release): ReleaseType {
  if (!rel.prerelease) return 1;
  return /alpha/i.test(`${rel.tag_name} ${rel.name ?? ""}`) ? 3 : 2;
}
