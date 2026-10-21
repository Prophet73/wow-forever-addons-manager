import { useEffect, useState } from "react";
import type { ReleaseType } from "../../shared/types";
import { IconCheck, IconFolder } from "../icons";
import { KeyGuide } from "../KeyGuide";
import { LanguagePicker } from "../LanguagePicker";
import { Checkbox, PageHeader } from "../ui";
import { api, type ViewProps } from "../util";
import { AppUpdateCheck } from "./AppUpdateCheck";
import { RELEASE_OPTIONS } from "./Library";
import { t } from "../../shared/i18n";

export function SettingsView({ state, run }: ViewProps) {
  const s = state.settings;
  const [gamePath, setGamePath] = useState(s.gamePath);
  const [key, setKey] = useState(s.curseforgeApiKey);
  const [ghToken, setGhToken] = useState(s.githubToken);
  const [channel, setChannel] = useState<ReleaseType>(s.maxReleaseType);
  const [backups, setBackups] = useState(s.backupsToKeep);
  const [checkOnStartup, setCheckOnStartup] = useState(s.checkOnStartup);
  const [saved, setSaved] = useState(false);
  const [clients, setClients] = useState<string[]>([]);
  // Saving turns a picked parent or subfolder into the client folder; show what was stored.
  useEffect(() => setGamePath(s.gamePath), [s.gamePath]);
  useEffect(() => {
    api.findGameFolders().then(setClients, () => setClients([]));
  }, []);

  const patch = {
    gamePath: gamePath.trim(),
    curseforgeApiKey: key.trim(),
    githubToken: ghToken.trim(),
    maxReleaseType: channel,
    backupsToKeep: backups,
    checkOnStartup,
  };
  const dirty = (Object.keys(patch) as (keyof typeof patch)[]).some((k) => patch[k] !== s[k]);

  const save = async () => {
    const ok = await run(() => api.saveSettings(patch));
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const keyBadge =
    state.keyStatus === "ok" ? <span className="ok-badge">{t("ключ работает")}</span> : state.keyStatus === "rejected" ? <span className="warn-badge">{t("ключ не принят")}</span> : null;

  return (
    <div className="page narrow">
      <PageHeader
        title={t("Настройки")}
        actions={
          <button className="primary" onClick={save} disabled={!dirty}>
            {saved ? (
              <>
                <IconCheck size={16} /> {t("Сохранено")}
              </>
            ) : (
              t("Сохранить")
            )}
          </button>
        }
      />

      <section className="card form">
        <h3>
          Язык / Language <LanguagePicker value={s.language || "ru"} run={run} />
        </h3>
      </section>

      <section className="card form">
        <h3>{t("Игра")}</h3>
        <label>
          {t("Папка клиента WoW Forever")}
          <div className="row">
            <input value={gamePath} onChange={(e) => setGamePath(e.target.value)} placeholder="D:\Games\World of Warcraft\_classic_beta_" />
            <button
              onClick={() =>
                run(async () => {
                  const p = await api.pickGameFolder();
                  if (p) setGamePath(p);
                })
              }
            >
              <IconFolder size={16} /> {t("Обзор")}
            </button>
          </div>
          <span className="hint">
            {t("Бета лежит в _classic_beta_, основной клиент в _forever_. Можно выбрать и папку World of Warcraft: нужная найдётся внутри. У каждого клиента свой список аддонов.")}
          </span>
        </label>
        {clients.length > 1 && (
          <div className="folder-choices">
            <span className="muted">{t("Найденные клиенты")}</span>
            {clients.map((f) => (
              <label key={f} className={`folder-choice${f.toLowerCase() === gamePath.toLowerCase() ? " active" : ""}`}>
                <input type="radio" name="client" checked={f.toLowerCase() === gamePath.toLowerCase()} onChange={() => setGamePath(f)} />
                <span className="mono">{f}</span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="card form">
        <h3>CurseForge {keyBadge}</h3>
        {state.keyStatus !== "ok" && <KeyGuide />}
        <label>
          {t("API-ключ")}
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="$2a$10$…" />
          <span className="hint">{t("Нужен для каталога и поиска. Без ключа обновления всё равно работают.")}</span>
        </label>
      </section>

      <section className="card form">
        <h3>GitHub</h3>
        <label>
          {t("Токен")} <span className="muted">{t("(необязательно)")}</span>
          <input type="password" value={ghToken} onChange={(e) => setGhToken(e.target.value)} placeholder="github_pat_…" />
          <span className="hint">
            {t("Без токена GitHub даёт 60 запросов в час. Токен без каких-либо прав (только чтение публичных репозиториев) поднимает лимит до 5000.")}{" "}
            <a href="#" onClick={(e) => (e.preventDefault(), api.openExternal("https://github.com/settings/personal-access-tokens/new"))}>
              {t("Создать токен")}
            </a>
          </span>
        </label>
      </section>

      <section className="card form">
        <h3>{t("Обновления")}</h3>
        <AppUpdateCheck state={state} run={run} />
        <label>
          {t("Какие версии ставить")}
          <select value={channel} onChange={(e) => setChannel(Number(e.target.value) as ReleaseType)}>
            {RELEASE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.label)}
              </option>
            ))}
          </select>
          <span className="hint">{t(RELEASE_OPTIONS.find((o) => o.value === channel)?.hint ?? "")} {t("Для отдельного аддона это можно поменять, нажав на него в списке.")}</span>
        </label>
        <label>
          {t("Сколько старых версий хранить для отката")}
          <input type="number" min={0} max={10} value={backups} onChange={(e) => setBackups(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} />
        </label>
        <Checkbox checked={checkOnStartup} onChange={setCheckOnStartup}>
          {t("Проверять обновления аддонов при запуске")}
        </Checkbox>
      </section>

    </div>
  );
}
