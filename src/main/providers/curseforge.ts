import type { Category, ReleaseType, RemoteFile, SearchPage, SearchParams, SearchSort } from "../../shared/types";
import { USER_AGENT, type FileQuery, type Provider, type ResolvedAddon } from "./types";
import { t } from "../../shared/i18n";

const WOW_GAME_ID = 1;
const OFFICIAL = "https://api.curseforge.com/v1";
const WEB = "https://www.curseforge.com/api/v1";

// CurseForge ModsSearchSortField values.
const SORT_FIELDS: Record<SearchSort, number> = { popular: 2, updated: 3, name: 4, downloads: 6, newest: 11 };

export class KeyRejectedError extends Error {
  constructor() {
    super(t("CurseForge не принял API-ключ. Скорее всего, он ещё не одобрен: проверь статус на console.curseforge.com. Обновления пока работают и без него."));
  }
}

/**
 * CurseForge. With an API key it uses the official API; without one (or if the key is
 * refused) it falls back to the endpoints the CurseForge website itself uses, which only
 * expose file lists and downloads — no search and no project info.
 */
export class CurseForge implements Provider {
  readonly id = "curseforge" as const;
  /** The key CurseForge last refused; a different key gets tried again. */
  private rejectedKey: string | null = null;
  private categoryCache: Category[] | null = null;

  constructor(private readonly getKey: () => string) {}

  private get key(): string {
    return this.getKey().trim();
  }

  get hasKey(): boolean {
    return this.key.length > 0 && this.key !== this.rejectedKey;
  }

  get keyStatus(): "ok" | "none" | "rejected" {
    if (!this.key) return "none";
    return this.key === this.rejectedKey ? "rejected" : "ok";
  }

  /** Asks CurseForge whether the key is valid; the result shows up in keyStatus. */
  async verifyKey(): Promise<void> {
    if (!this.key) return;
    this.rejectedKey = null;
    try {
      await this.json(`${OFFICIAL}/games/${WOW_GAME_ID}`);
    } catch {
      // A rejection is recorded by json(); network errors leave the key assumed good.
    }
  }

  // ---- Provider ------------------------------------------------------------

  async resolve(input: string): Promise<ResolvedAddon | null> {
    const s = input.trim();
    if (/^\d+$/.test(s)) return (await this.info(s)) ?? { id: s, name: null, url: null, iconUrl: null, categories: [] };
    const slug = /curseforge\.com\/wow\/addons\/([\w-]+)/i.exec(s)?.[1];
    if (!slug) return null;
    if (!this.hasKey) {
      throw new Error(t("Без API-ключа CurseForge по ссылке не найти. Вставь Project ID: он есть на странице аддона справа, в блоке «About Project»."));
    }
    const r = await this.json<{ data: OfficialMod[] }>(`${OFFICIAL}/mods/search?gameId=${WOW_GAME_ID}&slug=${encodeURIComponent(slug)}`);
    const m = r.data.find((d) => d.slug === slug) ?? r.data[0];
    if (!m) throw new Error(t("Аддон «{slug}» не найден на CurseForge.", { slug: slug }));
    return toResolved(m);
  }

  /** Project info needs the official API; without a working key there is nothing to say. */
  async info(id: string): Promise<ResolvedAddon | null> {
    if (!this.hasKey) return null;
    const r = await this.json<{ data: OfficialMod }>(`${OFFICIAL}/mods/${id}`).catch(() => null);
    return r ? toResolved(r.data) : null;
  }

  async latestFile(id: string, q: FileQuery): Promise<RemoteFile | null> {
    const files = await this.listFiles(Number(id), q.flavorTypeId);
    return files.find((f) => f.releaseType <= q.maxReleaseType) ?? null;
  }

  async downloadUrl(id: string, file: RemoteFile): Promise<string> {
    return this.withFallback(
      async () => {
        const r = await this.json<{ data: string }>(`${OFFICIAL}/mods/${id}/files/${file.fileId}/download-url`);
        if (r.data) return r.data;
        throw new Error(t("Автор аддона запретил скачивание через сторонние программы."));
      },
      async () => `${WEB}/mods/${id}/files/${file.fileId}/download`,
    );
  }

  // ---- catalog (API key only) ------------------------------------------------

  async search(p: SearchParams, flavorTypeId: number, pageSize = 30): Promise<SearchPage> {
    await this.requireKey();
    const params = new URLSearchParams({
      gameId: String(WOW_GAME_ID),
      gameVersionTypeId: String(flavorTypeId),
      sortField: String(SORT_FIELDS[p.sort] ?? SORT_FIELDS.popular),
      sortOrder: p.sort === "name" ? "asc" : "desc",
      index: String(p.index),
      pageSize: String(pageSize),
    });
    if (p.query.trim()) params.set("searchFilter", p.query.trim());
    if (p.categoryId) params.set("categoryId", String(p.categoryId));
    const r = await this.json<{ data: OfficialMod[]; pagination: { index: number; totalCount: number } }>(`${OFFICIAL}/mods/search?${params}`);
    return {
      index: r.pagination.index,
      // The API refuses index + pageSize beyond 10 000.
      total: Math.min(r.pagination.totalCount, 10000),
      results: r.data.map((m) => ({
        projectId: m.id,
        name: m.name,
        summary: m.summary ?? "",
        author: m.authors?.[0]?.name ?? "",
        downloads: m.downloadCount ?? 0,
        thumbnailUrl: m.logo?.thumbnailUrl ?? null,
        url: m.links?.websiteUrl ?? null,
        updated: m.dateReleased ?? m.dateModified ?? "",
      })),
    };
  }

  /** Top-level WoW addon categories. */
  async categories(): Promise<Category[]> {
    await this.requireKey();
    if (this.categoryCache) return this.categoryCache;
    const r = await this.json<{ data: { id: number; name: string; parentCategoryId?: number; iconUrl?: string }[] }>(
      `${OFFICIAL}/categories?gameId=${WOW_GAME_ID}`,
    );
    this.categoryCache = r.data
      .filter((c) => c.parentCategoryId === 1)
      .map((c) => ({ id: c.id, name: c.name, iconUrl: c.iconUrl ?? null }));
    return this.categoryCache;
  }

  // ---- internals ----------------------------------------------------------------

  /** Recent files compatible with the flavor, newest first. */
  private async listFiles(projectId: number, flavorTypeId: number): Promise<RemoteFile[]> {
    return this.withFallback(
      async () => {
        const r = await this.json<{ data: OfficialFile[] }>(`${OFFICIAL}/mods/${projectId}/files?gameVersionTypeId=${flavorTypeId}&pageSize=20`);
        return r.data.filter((f) => f.isAvailable !== false).map(fromOfficial).sort(byDateDesc);
      },
      async () => {
        const r = await this.json<{ data: WebFile[] }>(
          `${WEB}/mods/${projectId}/files?pageIndex=0&pageSize=20&sort=dateCreated&sortDescending=true&gameVersionTypeId=${flavorTypeId}`,
        );
        // The filter param is honoured today, but double-check so a silent API change can't
        // hand us a Classic Era build.
        return r.data.filter((f) => f.gameVersionTypeIds?.includes(flavorTypeId)).map(fromWeb).sort(byDateDesc);
      },
    );
  }

  /** A rejection may have been a CurseForge hiccup, so a rejected key is re-checked before refusing. */
  private async requireKey(): Promise<void> {
    if (this.keyStatus === "rejected") await this.verifyKey();
    if (this.keyStatus === "rejected") throw new KeyRejectedError();
    if (!this.hasKey) throw new Error(t("Для поиска нужен CurseForge API-ключ в Настройках."));
  }

  /** Runs the official-API path, falling back to the website endpoints if it fails. */
  private async withFallback<T>(official: () => Promise<T>, web: () => Promise<T>): Promise<T> {
    if (this.hasKey) {
      try {
        return await official();
      } catch {
        // the website endpoints need no key and serve the same files
      }
    }
    return web();
  }

  /** GET with retries: CurseForge sporadically answers 403/429 to a valid key. */
  private async get(url: string): Promise<Response> {
    const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: "application/json" };
    if (url.startsWith(OFFICIAL)) headers["x-api-key"] = this.key;
    let res = await fetch(url, { headers });
    for (const delay of [800, 2000]) {
      if (res.ok || ![403, 429, 500, 502, 503].includes(res.status)) break;
      await res.body?.cancel();
      await new Promise((r) => setTimeout(r, delay));
      res = await fetch(url, { headers });
    }
    return res;
  }

  /**
   * A 403 on one endpoint (a file the author keeps off third-party apps, a CurseForge hiccup)
   * says nothing about the key, so only a refused probe marks the key as rejected.
   */
  private async keyRefused(): Promise<boolean> {
    try {
      const res = await this.get(`${OFFICIAL}/games/${WOW_GAME_ID}`);
      await res.body?.cancel();
      return res.status === 401 || res.status === 403;
    } catch {
      return false;
    }
  }

  private async json<T>(url: string): Promise<T> {
    const official = url.startsWith(OFFICIAL);
    const res = await this.get(url);
    if (!res.ok) {
      if (official && (res.status === 401 || res.status === 403)) {
        if (url.endsWith(`/games/${WOW_GAME_ID}`) || (await this.keyRefused())) {
          this.rejectedKey = this.key;
          throw new KeyRejectedError();
        }
        throw new Error(t("CurseForge отклонил запрос (HTTP {status}).", { status: res.status }));
      }
      if (res.status === 403) throw new Error(t("CurseForge отклонил запрос (403). Для этого нужен рабочий API-ключ в настройках."));
      throw new Error(`CurseForge: HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }
}

interface WebFile {
  id: number;
  displayName: string;
  fileName: string;
  fileLength: number;
  dateCreated: string;
  releaseType: ReleaseType;
  gameVersions: string[];
  gameVersionTypeIds?: number[];
}

interface OfficialFile {
  id: number;
  displayName: string;
  fileName: string;
  fileLength: number;
  fileDate: string;
  releaseType: ReleaseType;
  gameVersions: string[];
  isAvailable?: boolean;
}

interface OfficialMod {
  id: number;
  name: string;
  slug?: string;
  summary?: string;
  downloadCount?: number;
  authors?: { name: string }[];
  logo?: { thumbnailUrl?: string } | null;
  links?: { websiteUrl?: string };
  categories?: { id: number; name: string }[];
  dateModified?: string;
  dateReleased?: string;
}

function toResolved(m: OfficialMod): ResolvedAddon {
  return {
    id: String(m.id),
    name: m.name,
    url: m.links?.websiteUrl ?? null,
    iconUrl: m.logo?.thumbnailUrl ?? null,
    categories: (m.categories ?? []).map((c) => c.name),
  };
}

function fromWeb(f: WebFile): RemoteFile {
  return {
    fileId: f.id,
    displayName: f.displayName,
    fileName: f.fileName,
    fileLength: f.fileLength,
    date: f.dateCreated,
    releaseType: f.releaseType,
    gameVersions: f.gameVersions,
  };
}

function fromOfficial(f: OfficialFile): RemoteFile {
  return {
    fileId: f.id,
    displayName: f.displayName,
    fileName: f.fileName,
    fileLength: f.fileLength,
    date: f.fileDate,
    releaseType: f.releaseType,
    gameVersions: f.gameVersions,
  };
}

function byDateDesc(a: RemoteFile, b: RemoteFile): number {
  return Date.parse(b.date) - Date.parse(a.date);
}
