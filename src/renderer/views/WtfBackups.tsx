import type { WtfBackup, WtfState } from "../../shared/types";
import { IconUndo } from "../icons";
import { api, cleanError, formatAgo } from "../util";

/** Backups taken before each copy or timer preset, each restorable in one click. */
export function WtfBackups(props: {
  backups: WtfBackup[];
  gameRunning: boolean;
  onState: (s: WtfState) => void;
  onMessage: (m: { kind: "error" | "info"; text: string }) => void;
}) {
  if (props.backups.length === 0) return <p className="muted">Бэкапов пока нет. Они появляются перед каждым копированием.</p>;

  const restore = async (b: WtfBackup) => {
    if (!confirm("Вернуть файлы персонажей как было до этого изменения?")) return;
    try {
      props.onState(await api.wtfRestore(b.id));
      props.onMessage({ kind: "info", text: "Восстановлено." });
    } catch (e) {
      props.onMessage({ kind: "error", text: cleanError(e) });
    }
  };

  return (
    <section className="card">
      <div className="backup-list">
        {props.backups.map((b) => (
          <div className="backup" key={b.id}>
            <span>{formatAgo(b.createdAt)}</span>
            <span className="muted small">
              {b.targets.map((t) => t.split("/")[2].split("-")[0]).join(", ")} · {b.fileCount} файлов
            </span>
            <button className="sm" disabled={props.gameRunning} onClick={() => void restore(b)}>
              <IconUndo size={14} /> Вернуть
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
