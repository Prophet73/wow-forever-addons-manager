import { useState } from "react";
import { CLASS_COLORS, CLASS_LABELS, WOW_CLASSES, type WowClass } from "../../shared/classes";
import type { WtfCharacter, WtfState } from "../../shared/types";
import { Avatar } from "../ui";
import { api, cleanError } from "../util";

/** Per character: its class and a button that writes the class NeedToKnow timer preset. */
export function WtfTimers(props: {
  characters: WtfCharacter[];
  gameRunning: boolean;
  onState: (s: WtfState) => void;
  onMessage: (m: { kind: "error" | "info"; text: string }) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, action: () => Promise<WtfState>, done?: string) => {
    setBusy(id);
    try {
      props.onState(await action());
      if (done) props.onMessage({ kind: "info", text: done });
    } catch (e) {
      props.onMessage({ kind: "error", text: cleanError(e) });
    }
    setBusy(null);
  };

  return (
    <section className="card">
      <p className="hint">
        Одинаковая раскладка для всех классов: над собой твои короткие эффекты, над целью контроль, над фокусом контроль и твои
        дебаффы. Выбери класс персонажа, чтобы применить набор.
      </p>
      <div className="backup-list">
        {props.characters.map((c) => (
          <div className="backup timer-row" key={c.id}>
            <Avatar name={c.name} size={26} color={c.wowClass ? CLASS_COLORS[c.wowClass] : undefined} />
            <span className="char-name">{c.name}</span>
            <select
              value={c.wowClass ?? ""}
              disabled={busy === c.id}
              onChange={(e) => void run(c.id, () => api.setCharacterClass(c.id, (e.target.value || null) as WowClass | null))}
            >
              <option value="">класс?</option>
              {WOW_CLASSES.map((w) => (
                <option key={w} value={w}>
                  {CLASS_LABELS[w]}
                </option>
              ))}
            </select>
            <button
              className="sm"
              disabled={!c.wowClass || props.gameRunning || busy === c.id}
              onClick={() => {
                if (!confirm(`Заменить таймеры NeedToKnow у ${c.name} на набор «${CLASS_LABELS[c.wowClass!]}»? Старые сохранятся в бэкап.`)) return;
                void run(c.id, () => api.applyTimerPreset(c.id), `Таймеры у ${c.name} обновлены.`);
              }}
            >
              Поставить таймеры
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
