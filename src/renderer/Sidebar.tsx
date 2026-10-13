import type { ReactNode } from "react";
import type { AppState } from "../shared/types";
import {
  IconDownload,
  IconFlame,
  IconFolder,
  IconGithub,
  IconLibrary,
  IconPack,
  IconSettings,
  IconUpdate,
  IconUsers,
} from "./icons";
import { needsAction } from "../shared/addon";
import { Brand } from "./Brand";
import { t } from "../shared/i18n";

export type View = "installed" | "updates" | "manual" | "packs" | "wtf" | "curseforge" | "github" | "jobs" | "settings";

function Item(props: {
  id: View;
  view: View;
  setView: (v: View) => void;
  icon: ReactNode;
  label: string;
  count?: number;
  badge?: number;
}) {
  const active = props.view === props.id;
  return (
    <button className={`nav-item${active ? " active" : ""}`} onClick={() => props.setView(props.id)} aria-current={active ? "page" : undefined}>
      <span className="nav-icon">{props.icon}</span>
      <span className="nav-label">{props.label}</span>
      {!!props.badge && <span className="nav-badge">{props.badge}</span>}
      {!props.badge && props.count !== undefined && props.count > 0 && <span className="nav-count">{props.count}</span>}
    </button>
  );
}

export function Sidebar(props: { state: AppState; view: View; setView: (v: View) => void }) {
  const { state, view, setView } = props;
  const updates = state.addons.filter(needsAction).length;
  const activeJobs = state.jobs.filter((j) => j.state === "running" || j.state === "queued").length;
  const failedJobs = state.jobs.filter((j) => j.state === "error").length;
  const nav = { view, setView };

  let status: { cls: string; text: string };
  if (!state.settings.gamePath) status = { cls: "bad", text: t("Папка игры не выбрана") };
  else if (state.gameRunning) status = { cls: "warn", text: t("Игра запущена") };
  else if (activeJobs) status = { cls: "busy", text: t("Работаю: {activeJobs}", { activeJobs: activeJobs }) };
  else status = { cls: "ok", text: t("Готово") };

  return (
    <aside className="sidebar">
      <Brand />

      <nav>
        <div className="nav-section">{t("Библиотека")}</div>
        <Item id="installed" icon={<IconLibrary />} label={t("Установленные")} count={state.addons.length} {...nav} />
        <Item id="updates" icon={<IconUpdate />} label={t("Обновления")} badge={updates} {...nav} />
        <Item id="manual" icon={<IconFolder />} label={t("Вручную")} count={state.untracked.length} {...nav} />

        <div className="nav-section">{t("Инструменты")}</div>
        <Item id="packs" icon={<IconPack />} label={t("Сборки")} count={state.packs.length} {...nav} />
        <Item id="wtf" icon={<IconUsers />} label={t("Персонажи")} {...nav} />

        <div className="nav-section">{t("Источники")}</div>
        <Item id="curseforge" icon={<IconFlame />} label="CurseForge" {...nav} />
        <Item id="github" icon={<IconGithub />} label="GitHub" count={state.addons.filter((a) => a.provider === "github").length} {...nav} />
      </nav>

      <div className="sidebar-bottom">
        <Item id="jobs" icon={<IconDownload />} label={t("Загрузки")} badge={activeJobs || undefined} count={failedJobs} {...nav} />
        <Item id="settings" icon={<IconSettings />} label={t("Настройки")} {...nav} />
        <div className={`status ${status.cls}`}>
          <span className="dot" />
          <span>{status.text}</span>
        </div>
      </div>
    </aside>
  );
}
