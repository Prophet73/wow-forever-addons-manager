import { useMemo, useState } from "react";
import type { Job, ProviderId, ReleaseType, TrackedAddon } from "../../shared/types";
import { byCategoryLabel, categoryLabel } from "../categories";
import { IconCheck, IconFlame, IconLibrary, IconRefresh, IconSearch, IconTrash, IconUndo, IconUpdate } from "../icons";
import { hasUpdate, needsAction, PROVIDER_LABEL } from "../../shared/addon";
import { Avatar, Empty, PageHeader } from "../ui";
import { addonPage, api, formatAgo, formatDate, formatSize, versionOf, type ViewProps } from "../util";
import { plural, t } from "../../shared/i18n";

export const RELEASE_OPTIONS: { value: ReleaseType; label: string; hint: string }[] = [
  { value: 1, label: "Только стабильные", hint: "Обычные релизы. Самый надёжный вариант." },
  { value: 2, label: "Стабильные + бета", hint: "Бета-версии выходят раньше, но могут глючить." },
  { value: 3, label: "Все, включая альфа", hint: "Самые свежие тестовые сборки автора. Для смелых." },
];

export function LibraryView(props: ViewProps & { mode: "installed" | "updates"; checking: boolean; onCheck: () => void }) {
  const { state, run, setView, mode, checking, onCheck } = props;
  const [filter, setFilter] = useState<Filter>({ query: "", source: null, category: null });

  const jobsByAddon = useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of state.jobs) if (!m.has(j.key)) m.set(j.key, j);
    return m;
  }, [state.jobs]);

  const pending = state.addons.filter(needsAction);
  const scope = mode === "updates" ? pending : state.addons;
  const list = scope.filter((a) => matches(a, filter));
  const lastChecked = state.addons.map((a) => a.lastChecked).filter(Boolean).sort().pop();

  const actions = (
    <>
      <button onClick={onCheck} disabled={checking || !state.addons.length}>
        <IconRefresh size={16} className={checking ? "spin" : ""} /> {checking ? t("Проверяю…") : t("Проверить")}
      </button>
      <button className="primary" onClick={() => run(() => api.updateAll())} disabled={!pending.length || state.gameRunning}>
        <IconUpdate size={16} /> {t("Обновить всё")}{pending.length ? ` (${pending.length})` : ""}
      </button>
    </>
  );

  return (
    <div className="page">
      <PageHeader
        title={mode === "updates" ? t("Обновления") : t("Установленные")}
        subtitle={
          state.addons.length
            ? t("{addons} {p1} · проверено {p2}", { addons: state.addons.length, p1: plural(state.addons.length, "аддон", "аддона", "аддонов"), p2: formatAgo(lastChecked) })
            : t("Здесь будут аддоны, которые ставит и обновляет менеджер")
        }
        actions={actions}
      />
      {state.gameRunning && <div className="banner warn">{t("Игра запущена: установка и обновления подождут, пока не закроешь WoW.")}</div>}

      {scope.length > 0 && <FilterBar addons={scope} filter={filter} onChange={setFilter} />}

      {state.addons.length === 0 ? (
        <Empty icon={<IconLibrary size={40} />} title={t("Пока ни одного аддона")}>
          <p>{t("Найди аддоны в каталоге или примени сборку.")}</p>
          <button className="primary" onClick={() => setView("curseforge")}>
            <IconFlame size={16} /> {t("Открыть каталог CurseForge")}
          </button>
        </Empty>
      ) : list.length === 0 ? (
        scope.length === 0 ? (
          <Empty icon={<IconCheck size={40} />} title={t("Всё свежее")}>
            <p>{t("Обновлений нет. Последняя проверка:")} {formatAgo(lastChecked)}.</p>
          </Empty>
        ) : (
          <Empty icon={<IconSearch size={40} />} title={t("Ничего не найдено")} />
        )
      ) : (
        <div className="addon-list">
          {list.map((a) => (
            <AddonRow
              key={a.key}
              addon={a}
              job={jobsByAddon.get(a.key)}
              defaultChannel={state.settings.maxReleaseType}
              gameRunning={state.gameRunning}
              run={run}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface Filter {
  query: string;
  source: ProviderId | null;
  category: string | null;
}

function matches(a: TrackedAddon, f: Filter): boolean {
  if (f.source && a.provider !== f.source) return false;
  if (f.category && !a.categories?.includes(f.category)) return false;
  const q = f.query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [a.name, ...a.folders, ...(a.categories ?? []).map(categoryLabel)].join(" ").toLowerCase();
  return haystack.includes(q);
}

/** Search box plus source and category pickers built from the addons in view. */
function FilterBar(props: { addons: TrackedAddon[]; filter: Filter; onChange: (f: Filter) => void }) {
  const { addons, filter, onChange } = props;
  const sources = [...new Set(addons.map((a) => a.provider))];
  const categories = [...new Set(addons.flatMap((a) => a.categories ?? []))].sort(byCategoryLabel);
  const count = (pred: (a: TrackedAddon) => boolean) => addons.filter(pred).length;
  const set = (patch: Partial<Filter>) => onChange({ ...filter, ...patch });

  return (
    <div className="toolbar">
      <div className="search-box grow">
        <IconSearch size={16} />
        <input value={filter.query} onChange={(e) => set({ query: e.target.value })} placeholder={t("Поиск по названию, папке или категории")} />
      </div>
      {categories.length > 0 && (
        <select
          className={filter.category ? "picked" : undefined}
          value={filter.category ?? ""}
          onChange={(e) => set({ category: e.target.value || null })}
        >
          <option value="">{t("Все типы ·")} {addons.length}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)} · {count((a) => !!a.categories?.includes(c))}
            </option>
          ))}
        </select>
      )}
      {sources.length > 1 && (
        <select
          className={filter.source ? "picked" : undefined}
          value={filter.source ?? ""}
          onChange={(e) => set({ source: (e.target.value || null) as Filter["source"] })}
        >
          <option value="">{t("Все источники")}</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {PROVIDER_LABEL[s]} · {count((a) => a.provider === s)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function AddonRow(props: {
  addon: TrackedAddon;
  job: Job | undefined;
  defaultChannel: ReleaseType;
  gameRunning: boolean;
  run: ViewProps["run"];
}) {
  const { addon: a, job, defaultChannel, gameRunning, run } = props;
  const [open, setOpen] = useState(false);
  const active = !!job && (job.state === "running" || job.state === "queued");
  const update = hasUpdate(a);
  const channel = a.maxReleaseType ?? defaultChannel;

  return (
    <div className={`addon-row${needsAction(a) ? " has-update" : ""}${open ? " open" : ""}`}>
      <div className="addon-main" onClick={() => setOpen(!open)}>
        <Avatar name={a.name} src={a.iconUrl} />
        <div className="addon-info">
          <div className="addon-name">
            {a.name}
            <span className={`src-badge ${a.provider}`}>{PROVIDER_LABEL[a.provider]}</span>
            {channel > 1 && <span className="src-badge warn">{channel === 2 ? t("бета") : t("альфа")}</span>}
          </div>
          <div className="addon-meta">
            {a.installed ? (
              <>
                <span className="ver">{versionOf(a.installed.displayName)}</span>
                {update && a.latest && (
                  <>
                    <span className="arrow">→</span>
                    <span className="ver new">{versionOf(a.latest.displayName)}</span>
                    <span className="muted">· {formatDate(a.latest.date)}</span>
                  </>
                )}
              </>
            ) : (
              <span className="muted">{t("не установлен")}{a.latest ? ` · ${versionOf(a.latest.displayName)}` : ""}</span>
            )}
            {a.latest && <span className="muted">· {formatSize(a.latest.fileLength)}</span>}
          </div>
          {active && (
            <div className="progress">
              <div className="bar" style={{ width: `${Math.round((job!.progress ?? 0) * 100)}%` }} />
              <span>
                {job!.stage}
                {job!.progress != null && job!.state === "running" ? ` · ${Math.round(job!.progress * 100)}%` : ""}
              </span>
            </div>
          )}
          {job?.state === "error" && <div className="err">{t("Ошибка:")} {job.error}</div>}
        </div>
        <div className="addon-actions" onClick={(e) => e.stopPropagation()}>
          {needsAction(a) && (
            <button className="primary sm" disabled={active || gameRunning} onClick={() => run(() => api.install(a.key))}>
              {a.installed ? t("Обновить") : t("Установить")}
            </button>
          )}
          {!needsAction(a) && !active && (
            <span className="ok-badge">
              <IconCheck size={14} /> {t("актуально")}
            </span>
          )}
        </div>
      </div>

      {open && (
        <div className="addon-details">
          <div className="detail-grid">
            <div>
              <div className="label">{t("Папки в AddOns")}</div>
              <div>{a.folders.length ? a.folders.join(", ") : "—"}</div>
            </div>
            <div>
              <div className="label" title={t(RELEASE_OPTIONS.find((o) => o.value === channel)?.hint ?? "")}>
                {t("Какие версии ставить")}
              </div>
              <select
                value={a.maxReleaseType ?? 0}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  run(() => api.setAddonChannel(a.key, v ? (v as ReleaseType) : null));
                }}
              >
                <option value={0}>{t("Как в настройках (")}{t(RELEASE_OPTIONS.find((o) => o.value === defaultChannel)?.label ?? "").toLowerCase()})</option>
                {RELEASE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.label)}
                  </option>
                ))}
              </select>
              <div className="hint">{t(RELEASE_OPTIONS.find((o) => o.value === channel)?.hint ?? "")}</div>
            </div>
          </div>
          <div className="detail-actions">
            <button className="sm" onClick={() => api.openExternal(addonPage(a))}>
              {t("Страница на")} {PROVIDER_LABEL[a.provider]}
            </button>
            {a.backups.length > 0 && (
              <button className="sm" disabled={active || gameRunning} onClick={() => run(() => api.rollback(a.key))}>
                <IconUndo size={14} /> {t("Откатить на")} {versionOf(a.backups[0].file.displayName)}
              </button>
            )}
            <button
              className="sm danger"
              disabled={active}
              onClick={() => {
                if (confirm(t("Удалить «{name}» из игры?", { name: a.name }))) run(() => api.remove(a.key));
              }}
            >
              <IconTrash size={14} /> {t("Удалить")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
