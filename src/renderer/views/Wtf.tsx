import { useCallback, useEffect, useState } from "react";
import type { WtfState } from "../../shared/types";
import { IconUsers } from "../icons";
import { Banner, Empty, PageHeader } from "../ui";
import { api, cleanError, type ViewProps } from "../util";
import { WtfBackups } from "./WtfBackups";
import { WtfCopy } from "./WtfCopy";
import { WtfTimers } from "./WtfTimers";
import { t } from "../../shared/i18n";

type Tab = "copy" | "timers" | "backups";

export function WtfView({ state }: ViewProps) {
  const [wtf, setWtf] = useState<WtfState | null>(null);
  const [tab, setTab] = useState<Tab>("copy");
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const reload = useCallback(() => api.wtfState().then(setWtf, (e) => setMsg({ kind: "error", text: cleanError(e) })), []);
  useEffect(() => void reload(), [reload, state.settings.gamePath]);

  if (!wtf) return <div className="page muted">{t("Загрузка…")}</div>;

  if (!wtf.wtfExists || wtf.characters.length === 0) {
    return (
      <div className="page">
        <PageHeader title={t("Персонажи")} subtitle={t("Копирование настроек аддонов между персонажами")} />
        <Empty icon={<IconUsers size={40} />} title={t("Персонажей пока нет")}>
          <p>{t("Папка WTF появляется, когда заходишь в игру. Зайди на персонажей хотя бы раз, выйди из игры, и они появятся здесь.")}</p>
        </Empty>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "copy", label: t("Копирование") },
    { id: "timers", label: t("Таймеры NeedToKnow") },
    { id: "backups", label: t("Бэкапы{p0}", { p0: wtf.backups.length ? ` · ${wtf.backups.length}` : "" }) },
  ];
  const panel = { gameRunning: state.gameRunning, onState: setWtf, onMessage: setMsg };

  return (
    <div className="page">
      <PageHeader title={t("Персонажи")} subtitle={t("Настройки интерфейса и аддонов между твоими персонажами")} />
      {state.gameRunning && <Banner kind="warn">{t("Игра запущена: закрой WoW перед изменениями, иначе при выходе она перезапишет файлы.")}</Banner>}
      {msg && (
        <Banner kind={msg.kind === "error" ? "error" : "info"} onClose={() => setMsg(null)}>
          {msg.text}
        </Banner>
      )}
      <div className="chips tabs">
        {tabs.map((x) => (
          <button key={x.id} className={`chip${tab === x.id ? " active" : ""}`} onClick={() => setTab(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      {tab === "copy" && <WtfCopy characters={wtf.characters} {...panel} />}
      {tab === "timers" && <WtfTimers characters={wtf.characters} {...panel} />}
      {tab === "backups" && <WtfBackups backups={wtf.backups} {...panel} />}
    </div>
  );
}
