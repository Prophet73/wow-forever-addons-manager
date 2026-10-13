import { useCallback, useEffect, useState } from "react";
import type { AppState } from "../shared/types";
import { AppUpdateBanner } from "./AppUpdateBanner";
import { Sidebar, type View } from "./Sidebar";
import { Banner } from "./ui";
import { api, cleanError, storageGet, storageSet, type Run } from "./util";
import { CatalogView } from "./views/Catalog";
import { GitHubView } from "./views/GitHub";
import { JobsView } from "./views/Jobs";
import { LibraryView } from "./views/Library";
import { ManualView } from "./views/Manual";
import { PacksView } from "./views/Packs";
import { SettingsView } from "./views/Settings";
import { WelcomeView } from "./views/Welcome";
import { WtfView } from "./views/Wtf";

const VIEWS: View[] = ["installed", "updates", "manual", "packs", "wtf", "curseforge", "github", "jobs", "settings"];

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [view, setViewRaw] = useState<View>(() => {
    const v = storageGet("view") as View | null;
    return v && VIEWS.includes(v) ? v : "installed";
  });

  const setView = useCallback((v: View) => {
    setViewRaw(v);
    storageSet("view", v);
  }, []);

  const run: Run = useCallback(async (fn) => {
    try {
      setError(null);
      const s = await fn();
      if (s) setState(s);
      return true;
    } catch (e) {
      setError(cleanError(e));
      return false;
    }
  }, []);

  const check = useCallback(async () => {
    setChecking(true);
    await run(() => api.checkUpdates());
    setChecking(false);
  }, [run]);

  useEffect(() => {
    const off = api.onState(setState);
    api.getState().then((s) => {
      setState(s);
      if (!s.settings.gamePath) setWelcome(true);
      else if (s.settings.checkOnStartup && s.addons.length) void check();
    });
    // Keeps the "game running" indicator fresh.
    const t = setInterval(() => api.getState().then(setState), 15000);
    return () => {
      off();
      clearInterval(t);
    };
  }, [check, setView]);

  if (!state) return <div className="loading">Загрузка…</div>;

  if (welcome) {
    return (
      <>
        {error && (
          <Banner kind="error" onClose={() => setError(null)}>
            {error}
          </Banner>
        )}
        <WelcomeView
          state={state}
          run={run}
          onDone={(next) => {
            setWelcome(false);
            setView(next);
          }}
        />
      </>
    );
  }

  const common = { state, run, setView };
  let page;
  switch (view) {
    case "installed":
    case "updates":
      page = <LibraryView {...common} mode={view} checking={checking} onCheck={check} />;
      break;
    case "manual":
      page = <ManualView {...common} />;
      break;
    case "packs":
      page = <PacksView {...common} />;
      break;
    case "wtf":
      page = <WtfView {...common} />;
      break;
    case "curseforge":
      page = <CatalogView {...common} />;
      break;
    case "github":
      page = <GitHubView {...common} />;
      break;
    case "jobs":
      page = <JobsView {...common} />;
      break;
    case "settings":
      page = <SettingsView {...common} />;
      break;
  }

  return (
    <div className="shell">
      <Sidebar state={state} view={view} setView={setView} />
      <main className="content">
        {state.appUpdate && <AppUpdateBanner update={state.appUpdate} run={run} />}
        {error && (
          <Banner kind="error" onClose={() => setError(null)}>
            {error}
          </Banner>
        )}
        {page}
      </main>
    </div>
  );
}
