import { IconCheck, IconFolder } from "../icons";
import { Avatar, Empty, PageHeader } from "../ui";
import { api, type ViewProps } from "../util";

export function ManualView({ state, run }: ViewProps) {
  const groups = new Map<number, typeof state.untracked>();
  const plain: typeof state.untracked = [];
  for (const u of state.untracked) {
    if (u.curseProjectId) groups.set(u.curseProjectId, [...(groups.get(u.curseProjectId) ?? []), u]);
    else plain.push(u);
  }

  return (
    <div className="page">
      <PageHeader
        title="Установлены вручную"
        subtitle="Папки в Interface\AddOns, которые менеджер не отслеживает"
        actions={
          <button onClick={() => api.openAddonsFolder()} disabled={!state.settings.gamePath}>
            <IconFolder size={16} /> Открыть AddOns
          </button>
        }
      />
      {state.untracked.length === 0 ? (
        <Empty icon={<IconCheck size={40} />} title="Всё под контролем">
          <p>Все аддоны в папке игры управляются менеджером.</p>
        </Empty>
      ) : (
        <>
          {groups.size > 0 && (
            <section className="card">
              <h3>Можно взять под управление</h3>
              <p className="muted small">
                У этих аддонов есть CurseForge ID. Менеджер поставит свежую версию под Forever вместо ручной и дальше будет
                её обновлять.
              </p>
              <div className="addon-list compact">
                {[...groups.entries()].map(([id, folders]) => (
                  <div className="addon-row" key={id}>
                    <div className="addon-main">
                      <Avatar name={folders[0].title} />
                      <div className="addon-info">
                        <div className="addon-name">{folders[0].title}</div>
                        <div className="addon-meta muted">
                          {folders.map((f) => f.folder).join(", ")}
                          {folders[0].version && ` · ${folders[0].version}`}
                        </div>
                      </div>
                      <div className="addon-actions">
                        <button className="primary sm" onClick={() => run(() => api.trackUntracked(id))}>
                          Управлять
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {plain.length > 0 && (
            <section className="card">
              <h3>Без источника</h3>
              <p className="muted small">У этих папок нет CurseForge ID в .toc. Найди их в каталоге и поставь оттуда, тогда они начнут обновляться.</p>
              <ul className="folders">
                {plain.map((u) => (
                  <li key={u.folder}>
                    <span>{u.title !== u.folder ? `${u.title} (${u.folder})` : u.folder}</span>
                    <span className="muted">{u.version}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
