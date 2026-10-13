import { useEffect, useState } from "react";
import { Brand } from "../Brand";
import { IconCheck, IconFolder, IconRefresh } from "../icons";
import { KeyGuide } from "../KeyGuide";
import type { View } from "../Sidebar";
import { api, plural, type Run } from "../util";
import type { AppState } from "../../shared/types";

type Step = "game" | "key" | "done";

/** First-start setup: find the game, optionally add a CurseForge key, then point at what to do next. */
export function WelcomeView({ state, run, onDone }: { state: AppState; run: Run; onDone: (next: View) => void }) {
  const [step, setStep] = useState<Step>("game");
  return (
    <div className="welcome">
      <div className="welcome-card">
        <Brand className="welcome-brand" />
        <ol className="welcome-steps">
          {(["game", "key", "done"] as Step[]).map((s, i) => (
            <li key={s} className={s === step ? "active" : undefined}>
              {i + 1}. {s === "game" ? "Игра" : s === "key" ? "Каталог" : "Готово"}
            </li>
          ))}
        </ol>
        {step === "game" && <GameStep run={run} onNext={() => setStep("key")} />}
        {step === "key" && <KeyStep state={state} run={run} onNext={() => setStep("done")} />}
        {step === "done" && <DoneStep state={state} onDone={onDone} />}
      </div>
    </div>
  );
}

function GameStep({ run, onNext }: { run: Run; onNext: () => void }) {
  const [found, setFound] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  const search = () => {
    setFound(null);
    api.findGameFolders().then(
      (list) => {
        setFound(list);
        setChosen((c) => c ?? list[0] ?? null);
      },
      () => setFound([]),
    );
  };
  useEffect(search, []);

  const pick = async () => {
    let p: string | null = null;
    // pickGameFolder throws when the folder has no client; run() shows that as an error banner.
    await run(async () => {
      p = await api.pickGameFolder();
    });
    if (!p) return;
    setFound((list) => (list?.some((f) => f.toLowerCase() === p!.toLowerCase()) ? list : [...(list ?? []), p!]));
    setChosen(p);
  };

  const next = async () => {
    if (chosen && (await run(() => api.saveSettings({ gamePath: chosen })))) onNext();
  };

  return (
    <>
      <h2>Где установлен WoW Forever?</h2>
      {found === null ? (
        <p className="muted">
          <IconRefresh size={14} className="spin" /> Ищу игру на дисках…
        </p>
      ) : found.length === 0 ? (
        <p className="muted">Сам не нашёл. Укажи папку игры: подойдёт папка World of Warcraft или любая внутри неё.</p>
      ) : (
        <>
          <p className="muted">{found.length === 1 ? "Нашёл игру здесь:" : "Нашёл несколько копий, выбери нужную:"}</p>
          <div className="folder-choices">
            {found.map((f) => (
              <label key={f} className={`folder-choice${f === chosen ? " active" : ""}`}>
                <input type="radio" name="game" checked={f === chosen} onChange={() => setChosen(f)} />
                <span className="mono">{f}</span>
              </label>
            ))}
          </div>
        </>
      )}
      <div className="welcome-actions">
        <button onClick={pick}>
          <IconFolder size={16} /> Указать другую папку
        </button>
        <button className="primary" disabled={!chosen} onClick={next}>
          Дальше
        </button>
      </div>
    </>
  );
}

function KeyStep({ state, run, onNext }: { state: AppState; run: Run; onNext: () => void }) {
  const [key, setKey] = useState(state.settings.curseforgeApiKey);
  const [checking, setChecking] = useState(false);
  const saved = key.trim() === state.settings.curseforgeApiKey;

  const check = async () => {
    setChecking(true);
    await run(() => api.saveSettings({ curseforgeApiKey: key.trim() }));
    setChecking(false);
  };

  return (
    <>
      <h2>Ключ CurseForge</h2>
      <p className="muted">
        Можно пропустить: обновления установленных аддонов работают и без ключа. Он нужен, чтобы искать новые аддоны в каталоге.
      </p>
      <KeyGuide />
      <div className="row">
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="$2a$10$…" />
        <button onClick={check} disabled={!key.trim() || checking}>
          {checking ? <IconRefresh size={16} className="spin" /> : null} Проверить
        </button>
      </div>
      {saved && key.trim() && state.keyStatus === "ok" && (
        <span className="ok-badge">
          <IconCheck size={14} /> Ключ работает
        </span>
      )}
      {saved && key.trim() && state.keyStatus === "rejected" && (
        <span className="warn-badge">CurseForge не принял ключ. Проверь, что скопирован весь ключ, или попробуй позже.</span>
      )}
      <div className="welcome-actions">
        <button onClick={onNext}>Пропустить</button>
        <button className="primary" disabled={!saved || state.keyStatus !== "ok"} onClick={onNext}>
          Дальше
        </button>
      </div>
    </>
  );
}

function DoneStep({ state, onDone }: { state: AppState; onDone: (next: View) => void }) {
  const manageable = new Set(state.untracked.flatMap((u) => (u.curseProjectId ? [u.curseProjectId] : []))).size;
  const folders = state.untracked.length;
  return (
    <>
      <h2>Готово</h2>
      {folders === 0 ? (
        <p className="muted">В папке AddOns пока пусто. Аддоны можно найти в каталоге CurseForge или добавить по ссылке.</p>
      ) : (
        <p className="muted">
          В папке AddOns {folders} {plural(folders, "папка", "папки", "папок")} аддонов, поставленных вручную.
          {manageable > 0 && ` ${manageable} из них менеджер может взять под управление и дальше обновлять сам.`}
        </p>
      )}
      <div className="welcome-actions">
        {manageable > 0 ? (
          <>
            <button onClick={() => onDone("installed")}>Позже</button>
            <button className="primary" onClick={() => onDone("manual")}>
              Посмотреть аддоны
            </button>
          </>
        ) : (
          <button className="primary" onClick={() => onDone(state.keyStatus === "ok" ? "curseforge" : "installed")}>
            Начать
          </button>
        )}
      </div>
    </>
  );
}
