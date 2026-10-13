import { useCallback, useEffect, useState } from "react";
import type { WtfState } from "../../shared/types";
import { IconUsers } from "../icons";
import { Banner, Empty, PageHeader } from "../ui";
import { api, cleanError, type ViewProps } from "../util";
import { WtfBackups } from "./WtfBackups";
import { WtfCopy } from "./WtfCopy";
import { WtfTimers } from "./WtfTimers";

type Tab = "copy" | "timers" | "backups";

export function WtfView({ state }: ViewProps) {
  const [wtf, setWtf] = useState<WtfState | null>(null);
  const [tab, setTab] = useState<Tab>("copy");
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const reload = useCallback(() => api.wtfState().then(setWtf, (e) => setMsg({ kind: "error", text: cleanError(e) })), []);
  useEffect(() => void reload(), [reload, state.settings.gamePath]);

  if (!wtf) return <div className="page muted">Загрузка…</div>;

  if (!wtf.wtfExists || wtf.characters.length === 0) {
    return (
      <div className="page">
        <PageHeader title="Персонажи" subtitle="Копирование настроек аддонов между персонажами" />
        <Empty icon={<IconUsers size={40} />} title="Персонажей пока нет">
          <p>Папка WTF появляется, когда заходишь в игру. Зайди на персонажей хотя бы раз, выйди из игры, и они появятся здесь.</p>
        </Empty>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "copy", label: "Копирование" },
    { id: "timers", label: "Таймеры NeedToKnow" },
    { id: "backups", label: `Бэкапы${wtf.backups.length ? ` · ${wtf.backups.length}` : ""}` },
  ];
  const panel = { gameRunning: state.gameRunning, onState: setWtf, onMessage: setMsg };

  return (
    <div className="page">
      <PageHeader title="Персонажи" subtitle="Настройки интерфейса и аддонов между твоими персонажами" />
      {state.gameRunning && <Banner kind="warn">Игра запущена: закрой WoW перед изменениями, иначе при выходе она перезапишет файлы.</Banner>}
      {msg && (
        <Banner kind={msg.kind === "error" ? "error" : "info"} onClose={() => setMsg(null)}>
          {msg.text}
        </Banner>
      )}
      <div className="chips tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`chip${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "copy" && <WtfCopy characters={wtf.characters} {...panel} />}
      {tab === "timers" && <WtfTimers characters={wtf.characters} {...panel} />}
      {tab === "backups" && <WtfBackups backups={wtf.backups} {...panel} />}
    </div>
  );
}
