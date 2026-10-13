// Addons map each character to a settings profile with one line, keyed by the character in
// whatever "Name<sep>Realm" form the addon likes: ["Arthas - Lordaeron"] = "Default",
// ["Arthas-Classic Beta PvP 2"] = "Arthas-Classic Beta PvP 2", ...
// Without such a line for the new owner, the addon starts them on its default profile.

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Gives character `to` the same profile as character `from` in every one-line mapping keyed by
 * `from`. Names are the part of the WTF folder before "-"; the realm part is kept as it is.
 */
export function copyProfileKeys(text: string, from: string, to: string): string {
  if (from === to) return text;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const mapping = (name: string) => new RegExp(`^(\\s*)\\["${escape(name)}((?:[ -][^"]*)?)"\\] = ("(?:[^"\\\\]|\\\\.)*",?)$`);
  const source = mapping(from);
  const target = mapping(to);

  const lines = text.split(eol);
  const keys = new Set<string>();
  for (const line of lines) {
    const m = source.exec(line);
    if (m) keys.add(m[2]);
  }
  if (keys.size === 0) return text;

  const out: string[] = [];
  for (const line of lines) {
    const old = target.exec(line);
    if (old && keys.has(old[2])) continue;
    out.push(line);
    const m = source.exec(line);
    if (m) out.push(`${m[1]}["${to}${m[2]}"] = ${m[3]}`);
  }
  return out.join(eol);
}
