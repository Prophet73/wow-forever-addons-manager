// Addons map each character to a settings profile with one line, keyed by the character in
// whatever "Name<sep>Realm" form the addon likes: ["Arthas - Lordaeron"] = "Default",
// ["Arthas-Classic Beta PvP 2"] = "Arthas-Classic Beta PvP 2", ...
// Without such a line for the new owner, the addon starts them on its default profile.

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Drops the one-line mappings of the given characters, so a shared file doesn't list the
 * sender's other characters. Their profiles themselves stay.
 */
export function dropProfileKeys(text: string, names: string[]): string {
  if (names.length === 0) return text;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const keyed = new RegExp(`^\\s*\\["(?:${names.map(escape).join("|")})(?:[ -][^"]*)?"\\] = "(?:[^"\\\\]|\\\\.)*",?$`);
  return text
    .split(eol)
    .filter((line) => !keyed.test(line))
    .join(eol);
}

const mapping = (name: string) => new RegExp(`^(\\s*)\\["${escape(name)}((?:[ -][^"]*)?)"\\] = ("(?:[^"\\\\]|\\\\.)*",?)$`);

/** A key's realm part split into separator and realm: " Hendrik", " - CAMWOW EU4", "-CAMWOW EU4". */
const splitRealm = (suffix: string): [string, string] => {
  const m = /^( - |-| )(.*)$/.exec(suffix);
  return m ? [m[1], m[2]] : [suffix, ""];
};

/**
 * Realms `name` has one-line mappings under, by kind: `folder` is the realm part of the WTF folder
 * ("Name Realm" keys), `game` the realm name the game reports ("Name - Realm", "Name-Realm").
 */
export function profileRealms(text: string, name: string): { folder: string[]; game: string[] } {
  const key = mapping(name);
  const out = { folder: new Set<string>(), game: new Set<string>() };
  for (const line of text.split(/\r?\n/)) {
    const m = key.exec(line);
    if (!m || !m[2]) continue;
    const [sep, realm] = splitRealm(m[2]);
    out[sep === " " ? "folder" : "game"].add(realm);
  }
  return { folder: [...out.folder], game: [...out.game] };
}

/**
 * Gives character `to` the same profile as character `from` in every one-line mapping keyed by
 * `from`. Names are the part of the WTF folder before "-". `realms` maps the source's realms to
 * the target's (it may play on another server); an unlisted realm is kept as it is.
 */
export function copyProfileKeys(text: string, from: string, to: string, realms: Map<string, string[]> = new Map()): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const source = mapping(from);
  const target = mapping(to);
  const targetSuffixes = (suffix: string): string[] => {
    const [sep, realm] = splitRealm(suffix);
    return (realms.get(realm) ?? [realm]).map((r) => sep + r);
  };

  const lines = text.split(eol);
  const keys = new Set<string>();
  for (const line of lines) {
    const m = source.exec(line);
    if (m) for (const s of targetSuffixes(m[2])) keys.add(s);
  }
  if (keys.size === 0) return text;

  const out: string[] = [];
  for (const line of lines) {
    const m = source.exec(line);
    const old = target.exec(line);
    if (!m && old && keys.has(old[2])) continue;
    out.push(line);
    if (!m) continue;
    for (const s of new Set(targetSuffixes(m[2]))) {
      if (from !== to || s !== m[2]) out.push(`${m[1]}["${to}${s}"] = ${m[3]}`);
    }
  }
  return out.join(eol);
}
