import { addonKey } from "../shared/addon";
import type { PackAddon, ProviderId } from "../shared/types";
import { t } from "../shared/i18n";

/** Share codes look like "FA1.<base64url JSON>". The number is the code format, not the payload version. */
const PREFIX = "FA1.";
const PROVIDERS: ProviderId[] = ["curseforge", "github"];

/**
 * Payload v1: a = [[curseProjectId, name], ...]
 * Payload v2: a = [["curseforge:1715196" | "github:owner/repo", name], ...]
 */
interface PackPayload {
  v: 1 | 2;
  n: string;
  d: string;
  a: [number | string, string][];
}

export interface DecodedPack {
  name: string;
  description: string;
  addons: PackAddon[];
}

export function encodePack(pack: DecodedPack): string {
  const payload: PackPayload = { v: 2, n: pack.name, d: pack.description, a: pack.addons.map((a) => [addonKey(a), a.name]) };
  return PREFIX + Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/** Parses a share code. Everything in it is untrusted input from someone else. */
export function decodePack(code: string): DecodedPack {
  const s = code.trim();
  if (!s.startsWith(PREFIX)) throw new Error(t("Это не код сборки Forever Addons."));
  let payload: Partial<PackPayload>;
  try {
    payload = JSON.parse(Buffer.from(s.slice(PREFIX.length), "base64url").toString("utf8"));
  } catch {
    throw new Error(t("Код сборки повреждён."));
  }
  if ((payload.v !== 1 && payload.v !== 2) || !Array.isArray(payload.a)) throw new Error(t("Неподдерживаемая версия кода сборки."));
  const addons = dedupeAddons(
    payload.a.flatMap((entry) => {
      if (!Array.isArray(entry)) return [];
      const ref = parseRef(entry[0]);
      return ref ? [{ ...ref, name: String(entry[1] ?? ref.id).slice(0, 200) }] : [];
    }),
  );
  if (addons.length === 0) throw new Error(t("В сборке нет аддонов."));
  return {
    name: String(payload.n || t("Импорт")).slice(0, 100),
    description: String(payload.d ?? "").slice(0, 1000),
    addons,
  };
}

function parseRef(x: unknown): Omit<PackAddon, "name"> | null {
  if (typeof x === "number") return Number.isInteger(x) && x > 0 ? { provider: "curseforge", id: String(x) } : null;
  if (typeof x !== "string") return null;
  const i = x.indexOf(":");
  const provider = x.slice(0, i) as ProviderId;
  const id = x.slice(i + 1);
  if (!PROVIDERS.includes(provider)) return null;
  if (provider === "curseforge" && !/^\d+$/.test(id)) return null;
  if (provider === "github" && !/^[\w.-]+\/[\w.-]+$/.test(id)) return null;
  return { provider, id };
}

export function dedupeAddons(addons: PackAddon[]): PackAddon[] {
  const seen = new Set<string>();
  return addons.filter((a) => {
    const k = addonKey(a);
    return !seen.has(k) && (seen.add(k), true);
  });
}
