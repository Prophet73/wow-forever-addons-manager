import { useState } from "react";
import { IconCheck, IconGithub, IconPlus } from "../icons";
import { Avatar, Banner, PageHeader } from "../ui";
import { addonPage, api, cleanError, formatDate, versionOf, type ViewProps } from "../util";
import { t } from "../../shared/i18n";

export function GitHubView({ state, setView }: ViewProps) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const repos = state.addons.filter((a) => a.provider === "github");

  const add = async () => {
    if (!input.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.addAddon(input);
      setInput("");
    } catch (e) {
      setErr(cleanError(e));
    }
    setBusy(false);
  };

  return (
    <div className="page">
      <PageHeader title="GitHub" subtitle={t("Аддоны из релизов на GitHub")} />

      <section className="card">
        <h3>{t("Добавить репозиторий")}</h3>
        <div className="row">
          <div className="search-box grow">
            <IconGithub size={16} />
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder={t("https://github.com/автор/аддон")}
            />
          </div>
          <button className="primary" onClick={add} disabled={busy || !input.trim()}>
            <IconPlus size={16} /> {busy ? t("Ищу…") : t("Добавить и установить")}
          </button>
        </div>
        <p className="hint">
          {t("Менеджер берёт последний релиз и выбирает в нём архив под Forever: по release.json от упаковщика, по слову «forever» в названии или единственный общий архив. Если подходящего архива нет, скажет об этом.")}
        </p>
        {err && <Banner kind="error">{err}</Banner>}
      </section>

      {repos.length > 0 && (
        <div className="addon-list">
          {repos.map((a) => (
            <div className="addon-row" key={a.key}>
              <div className="addon-main" onClick={() => setView("installed")}>
                <Avatar name={a.name} src={a.iconUrl} />
                <div className="addon-info">
                  <div className="addon-name">{a.name}</div>
                  <div className="addon-meta muted">
                    <a href="#" onClick={(e) => (e.preventDefault(), e.stopPropagation(), api.openExternal(addonPage(a)))}>
                      {a.id}
                    </a>
                    {a.installed && <span>· {versionOf(a.installed.displayName)}</span>}
                    {a.latest && <span>{t("· релиз от")} {formatDate(a.latest.date)}</span>}
                  </div>
                </div>
                {a.installed && (
                  <span className="ok-badge">
                    <IconCheck size={14} /> {t("стоит")}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!state.settings.githubToken && (
        <p className="hint pad">
          {t("Без токена GitHub даёт 60 запросов в час. Обычно этого хватает; если аддонов с GitHub много, добавь токен в настройках.")}
        </p>
      )}
    </div>
  );
}
