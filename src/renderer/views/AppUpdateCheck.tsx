import { useState } from "react";
import type { AppState } from "../../shared/types";
import { IconCheck, IconRefresh } from "../icons";
import { api, cleanError, type Run } from "../util";
import { t } from "../../shared/i18n";

/** The app's own version and a button that asks GitHub for a newer one. */
export function AppUpdateCheck({ state, run }: { state: AppState; run: Run }) {
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The error goes under the button: the page-wide banner sits at the top, out of sight from here.
  const check = async () => {
    setChecking(true);
    setError(null);
    await run(() =>
      api.checkAppUpdate().catch((e) => {
        setError(cleanError(e));
      }),
    );
    setChecked(true);
    setChecking(false);
  };

  return (
    <div className="app-update-check">
      <div className="row about-row">
        <span>
          {t("Программа: Forever Addons")} <b>{state.appVersion}</b>
        </span>
        <button onClick={check} disabled={checking}>
          <IconRefresh size={16} className={checking ? "spin" : undefined} /> {t("Проверить обновления")}
        </button>
      </div>
      {checked && !checking && (
        error ? (
          <span className="warn-badge">{error}</span>
        ) : state.appUpdate ? (
          <span className="warn-badge">{t("Есть версия")} {state.appUpdate.version}{t(": нажми «Обновить и перезапустить» вверху.")}</span>
        ) : (
          <span className="ok-badge">
            <IconCheck size={14} /> {t("У тебя последняя версия.")}
          </span>
        )
      )}
    </div>
  );
}
