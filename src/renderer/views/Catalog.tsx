import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Category, SearchPage, SearchSort } from "../../shared/types";
import { IconCheck, IconFlame, IconSearch } from "../icons";
import { Avatar, Banner, Empty, PageHeader } from "../ui";
import { addonKey, needsAction } from "../../shared/addon";
import { byCategoryLabel, categoryLabel } from "../categories";
import { api, cleanError, formatCount, formatDate, storageGet, storageSet, type ViewProps } from "../util";

const SORTS: { value: SearchSort; label: string }[] = [
  { value: "popular", label: "Популярные" },
  { value: "updated", label: "Недавно обновлённые" },
  { value: "newest", label: "Новые" },
  { value: "downloads", label: "Больше скачиваний" },
  { value: "name", label: "По названию" },
];

export function CatalogView({ state, run, setView }: ViewProps) {
  const keyOk = state.keyStatus === "ok";
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SearchSort>(() => (storageGet("cf.sort") as SearchSort) || "popular");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState<SearchPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState<Set<number>>(new Set());
  const reqId = useRef(0);

  // A rejection can be a passing CurseForge error, so opening the catalog asks again.
  const rejected = state.keyStatus === "rejected";
  useEffect(() => {
    if (rejected) void run(() => api.verifyKey());
  }, [rejected, run]);

  const tracked = useMemo(() => new Map(state.addons.map((a) => [a.key, a])), [state.addons]);

  useEffect(() => {
    if (keyOk) api.categories().then(setCategories, () => {});
  }, [keyOk]);

  const load = useCallback(
    async (index: number) => {
      if (!keyOk) return;
      const id = ++reqId.current;
      setLoading(true);
      setErr(null);
      try {
        const p = await api.search({ query, index, sort, categoryId });
        if (id !== reqId.current) return; // a newer search started meanwhile
        setPage((prev) => (index > 0 && prev ? { ...p, results: [...prev.results, ...p.results] } : p));
      } catch (e) {
        if (id === reqId.current) setErr(cleanError(e));
      }
      if (id === reqId.current) setLoading(false);
    },
    [keyOk, query, sort, categoryId],
  );

  useEffect(() => {
    const t = setTimeout(() => void load(0), query ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const install = async (projectId: number) => {
    setAdding((s) => new Set(s).add(projectId));
    await run(() => api.addAddon(String(projectId)));
    setAdding((s) => {
      const n = new Set(s);
      n.delete(projectId);
      return n;
    });
  };

  if (!keyOk) {
    return (
      <div className="page">
        <PageHeader title="CurseForge" subtitle="Каталог аддонов под WoW Forever" />
        <Empty icon={<IconFlame size={40} />} title={state.keyStatus === "rejected" ? "Ключ не принят" : "Нужен API-ключ"}>
          <p>
            Для поиска по CurseForge нужен бесплатный ключ с console.curseforge.com (раздел API Keys). Обновления
            установленных аддонов работают и без него.
          </p>
          <div className="row">
            {rejected && <button onClick={() => void run(() => api.verifyKey())}>Проверить ещё раз</button>}
            <button className="primary" onClick={() => setView("settings")}>
              {rejected ? "Открыть настройки" : "Вставить ключ в настройках"}
            </button>
          </div>
        </Empty>
      </div>
    );
  }

  const cats = [...categories].sort((a, b) => byCategoryLabel(a.name, b.name));

  return (
    <div className="page">
      <PageHeader
        title="CurseForge"
        subtitle={page ? `${formatCount(page.total)} аддонов под Forever` : "Каталог аддонов под WoW Forever"}
      />
      <div className="toolbar">
        <div className="search-box grow">
          <IconSearch size={16} />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск: questie, details, bagnon…" />
        </div>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as SearchSort);
            storageSet("cf.sort", e.target.value);
          }}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {cats.length > 0 && (
          <select
            className={categoryId !== null ? "picked" : undefined}
            value={categoryId ?? ""}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Все категории</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c.name)}
              </option>
            ))}
          </select>
        )}
      </div>

      {err && <Banner kind="error">{err}</Banner>}

      <div className="catalog-grid">
        {page?.results.map((r) => {
          const t = tracked.get(addonKey({ provider: "curseforge", id: String(r.projectId) }));
          const busy = adding.has(r.projectId);
          return (
            <div className="catalog-card" key={r.projectId}>
              <Avatar name={r.name} src={r.thumbnailUrl} size={48} />
              <div className="catalog-info">
                <div className="catalog-title">
                  <a href="#" onClick={(e) => (e.preventDefault(), r.url && api.openExternal(r.url))}>
                    {r.name}
                  </a>
                </div>
                <div className="muted small">
                  {r.author} · ↓ {formatCount(r.downloads)} · {formatDate(r.updated)}
                </div>
                <div className="catalog-summary">{r.summary}</div>
              </div>
              <div className="catalog-action">
                {t ? (
                  needsAction(t) ? (
                    <button className="primary sm" onClick={() => run(() => api.install(t.key))}>
                      {t.installed ? "Обновить" : "Установить"}
                    </button>
                  ) : (
                    <span className="ok-badge">
                      <IconCheck size={14} /> стоит
                    </span>
                  )
                ) : (
                  <button className="primary sm" disabled={busy} onClick={() => install(r.projectId)}>
                    {busy ? "…" : "Установить"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {loading && <div className="muted center pad">Загружаю…</div>}
      {page && !loading && page.results.length === 0 && <Empty icon={<IconSearch size={40} />} title="Ничего не нашлось под Forever" />}
      {page && !loading && page.results.length > 0 && page.results.length < page.total && (
        <div className="center pad">
          <button onClick={() => load(page.results.length)}>Показать ещё</button>
        </div>
      )}
    </div>
  );
}
