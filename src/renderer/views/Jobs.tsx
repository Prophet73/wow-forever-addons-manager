import { IconDownload } from "../icons";
import { Empty, PageHeader } from "../ui";
import type { ViewProps } from "../util";

const KIND: Record<string, string> = {
  install: "Установка",
  update: "Обновление",
  rollback: "Откат",
  remove: "Удаление",
  check: "Проверка",
};

export function JobsView({ state }: ViewProps) {
  return (
    <div className="page">
      <PageHeader title="Загрузки" subtitle="Установки и обновления идут в фоне по очереди" />
      {state.jobs.length === 0 ? (
        <Empty icon={<IconDownload size={40} />} title="Пока пусто" />
      ) : (
        <div className="job-list">
          {state.jobs.map((j) => (
            <div className={`job ${j.state}`} key={j.id}>
              <div className="job-head">
                <span className="job-name">{j.name}</span>
                <span className="muted small">{KIND[j.kind] ?? j.kind}</span>
                <span className={`job-state ${j.state}`}>
                  {j.state === "queued" ? "в очереди" : j.state === "running" ? j.stage : j.state === "done" ? "готово" : "ошибка"}
                </span>
              </div>
              {j.state === "running" && (
                <div className="progress">
                  <div className="bar" style={{ width: `${Math.round((j.progress ?? 0) * 100)}%` }} />
                  <span>{j.progress != null ? `${Math.round(j.progress * 100)}%` : j.stage}</span>
                </div>
              )}
              {j.error && <div className="err">{j.error}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
