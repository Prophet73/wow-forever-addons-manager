import { useEffect, useMemo, useState } from "react";
import { CLASS_COLORS, CLASS_LABELS } from "../../shared/classes";
import type { WtfCharacter, WtfGroup, WtfState } from "../../shared/types";
import { IconArrowRight, IconCheck } from "../icons";
import { Avatar } from "../ui";
import { api, cleanError, formatAgo, plural } from "../util";

const GROUPS: { id: WtfGroup; label: string; hint: string }[] = [
  { id: "layout", label: "Расположение", hint: "Режим редактирования, положение окон и рамок X-Perl" },
  { id: "addonList", label: "Включённые аддоны", hint: "Галочки в списке аддонов на экране персонажей" },
  { id: "bindings", label: "Бинды", hint: "Если бинды сохранены для персонажа, а не для аккаунта" },
  { id: "macros", label: "Макросы", hint: "Макросы персонажа; макросы аккаунта и так общие" },
  { id: "chat", label: "Чат", hint: "Вкладки, каналы и цвета" },
  { id: "gameSettings", label: "Настройки игры", hint: "Опции интерфейса, сохранённые для персонажа" },
];

type Preset = "all" | "layout" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "all", label: "Весь интерфейс" },
  { id: "layout", label: "Только расположение" },
  { id: "custom", label: "Выбрать…" },
];

interface Selection {
  groups: WtfGroup[];
  savedVariables: string[];
}

function presetSelection(preset: Exclude<Preset, "custom">, source: WtfCharacter): Selection {
  if (preset === "layout") return { groups: source.has.layout ? ["layout"] : [], savedVariables: [] };
  return { groups: GROUPS.map((g) => g.id).filter((g) => source.has[g]), savedVariables: source.savedVariables };
}

/** "Arthas-Lordaeron" → ["Arthas", "Lordaeron"]. */
function splitName(folder: string): [string, string] {
  const i = folder.indexOf("-");
  return i < 0 ? [folder, ""] : [folder.slice(0, i), folder.slice(i + 1)];
}

/** Copy settings from one character to others: pick the source card, then the target cards. */
export function WtfCopy(props: {
  characters: WtfCharacter[];
  gameRunning: boolean;
  onState: (s: WtfState) => void;
  onMessage: (m: { kind: "error" | "info"; text: string }) => void;
}) {
  const { characters } = props;
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<Set<string>>(new Set());
  const [preset, setPreset] = useState<Preset>("all");
  const [custom, setCustom] = useState<Selection>({ groups: [], savedVariables: [] });
  const [busy, setBusy] = useState(false);

  const source = characters.find((c) => c.id === from) ?? null;
  const selection = useMemo<Selection>(
    () => (!source ? { groups: [], savedVariables: [] } : preset === "custom" ? custom : presetSelection(preset, source)),
    [source, preset, custom],
  );
  // A different source has different files: start the custom choice over from "everything".
  useEffect(() => {
    if (source) setCustom(presetSelection("all", source));
    // Only a new source resets it; a reload after copying hands back an equal but new object.
  }, [source?.id]);

  const clickCard = (c: WtfCharacter) => {
    if (!from) return setFrom(c.id);
    if (c.id === from) {
      setFrom(null);
      setTo(new Set());
      return;
    }
    setTo((t) => toggled(t, c.id, !t.has(c.id)));
  };

  const copy = async () => {
    if (!source) return;
    const names = characters.filter((c) => to.has(c.id)).map((c) => splitName(c.name)[0]);
    if (!confirm(`Скопировать настройки с ${splitName(source.name)[0]} на ${names.join(", ")}? Их текущие файлы сохранятся в бэкап.`)) return;
    setBusy(true);
    try {
      props.onState(await api.wtfCopy({ from: source.id, to: [...to], ...selection }));
      props.onMessage({ kind: "info", text: "Готово. Можно заходить в игру." });
      setTo(new Set());
    } catch (e) {
      props.onMessage({ kind: "error", text: cleanError(e) });
    }
    setBusy(false);
  };

  const others = characters.filter((c) => c.id !== from);
  const empty = selection.groups.length === 0 && selection.savedVariables.length === 0;

  return (
    <>
      <div className="step-hint">
        {!source ? (
          <>Нажми на персонажа, <b>с которого</b> копировать.</>
        ) : (
          <>
            Теперь отметь, <b>на кого</b>. Нажми на источник ещё раз, чтобы выбрать другой.
            <button className="link" onClick={() => setTo(new Set(others.map((c) => c.id)))}>
              отметить всех
            </button>
          </>
        )}
      </div>

      <div className="char-grid">
        {characters.map((c) => (
          <CharCard key={c.id} c={c} role={c.id === from ? "source" : to.has(c.id) ? "target" : from ? "candidate" : "idle"} onClick={() => clickCard(c)} />
        ))}
      </div>

      {source && (
        <section className="card copy-what">
          <div className="chips">
            {PRESETS.map((p) => (
              <button key={p.id} className={`chip${preset === p.id ? " active" : ""}`} onClick={() => setPreset(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          {preset === "custom" ? (
            <CustomPicker source={source} value={custom} onChange={setCustom} />
          ) : (
            <p className="hint">
              {preset === "all"
                ? `${GROUPS.filter((g) => source.has[g.id]).map((g) => g.label.toLowerCase()).join(", ")} и настройки ${source.savedVariables.length} ${plural(source.savedVariables.length, "аддона", "аддонов", "аддонов")}, сохранённые на персонажа.`
                : "Где стоят окна и рамки. Настройки самих аддонов не трогаются."}
            </p>
          )}
        </section>
      )}

      {source && (
        <div className="action-bar">
          <span className="action-summary">
            <b>{splitName(source.name)[0]}</b> <IconArrowRight size={14} />{" "}
            {to.size === 0 ? <span className="muted">выбери, на кого</span> : characters.filter((c) => to.has(c.id)).map((c) => splitName(c.name)[0]).join(", ")}
          </span>
          {props.gameRunning && <span className="warn-text">закрой игру</span>}
          <button className="primary" disabled={busy || to.size === 0 || empty || props.gameRunning} onClick={copy}>
            {busy ? "Копирую…" : "Скопировать"}
          </button>
        </div>
      )}
    </>
  );
}

function CharCard(props: { c: WtfCharacter; role: "source" | "target" | "candidate" | "idle"; onClick: () => void }) {
  const { c, role } = props;
  const [name, realm] = splitName(c.name);
  const color = c.wowClass ? CLASS_COLORS[c.wowClass] : undefined;
  return (
    <button className={`char-card ${role}`} onClick={props.onClick}>
      <Avatar name={name} size={34} color={color} />
      <span className="char-card-text">
        <span className="char-card-name">{name}</span>
        <span className="muted small">{realm}</span>
        <span className="small" style={color ? { color } : undefined}>
          {c.wowClass ? CLASS_LABELS[c.wowClass] : <span className="muted">класс неизвестен</span>}
          <span className="muted"> · {formatAgo(c.modified)}</span>
        </span>
      </span>
      {role === "source" && <span className="char-card-badge">откуда</span>}
      {role === "target" && (
        <span className="char-card-badge target">
          <IconCheck size={12} /> куда
        </span>
      )}
    </button>
  );
}

function CustomPicker(props: { source: WtfCharacter; value: Selection; onChange: (s: Selection) => void }) {
  const { source, value, onChange } = props;
  const svs = source.savedVariables;
  return (
    <>
      <div className="muted small picker-label">Файлы персонажа</div>
      <div className="chips">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            className={`chip${value.groups.includes(g.id) ? " active" : ""}`}
            disabled={!source.has[g.id]}
            title={source.has[g.id] ? g.hint : "У персонажа нет"}
            onClick={() => onChange({ ...value, groups: toggledList(value.groups, g.id) })}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="muted small picker-label">
        Настройки аддонов на персонажа · {value.savedVariables.length} из {svs.length}
        <button className="link" onClick={() => onChange({ ...value, savedVariables: svs })}>
          все
        </button>
        <button className="link" onClick={() => onChange({ ...value, savedVariables: [] })}>
          никого
        </button>
      </div>
      {svs.length === 0 ? (
        <p className="hint">У этого персонажа нет своих настроек аддонов.</p>
      ) : (
        <div className="chips">
          {svs.map((sv) => (
            <button
              key={sv}
              className={`chip${value.savedVariables.includes(sv) ? " active" : ""}`}
              onClick={() => onChange({ ...value, savedVariables: toggledList(value.savedVariables, sv) })}
            >
              {sv}
            </button>
          ))}
        </div>
      )}
      <p className="hint">Здесь только то, что аддоны сохранили отдельно на персонажа. Настройки на весь аккаунт и так общие.</p>
    </>
  );
}

function toggled<T>(set: Set<T>, v: T, on: boolean): Set<T> {
  const n = new Set(set);
  if (on) n.add(v);
  else n.delete(v);
  return n;
}

function toggledList<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}
