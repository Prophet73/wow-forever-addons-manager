import { useState } from "react";
import type { AppState } from "../../shared/types";
import { IconCheck, IconRefresh } from "../icons";
import { api, type Run } from "../util";
import { t } from "../../shared/i18n";

/** The app's own version and a button that asks GitHub for a newer one. */
export function AppUpdateCheck({ state, run }: { state: AppState; run: Run }) {
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);

  const check = async () => {
    setChecking(true);
    setChecked(await run(() => api.checkAppUpdate()));
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
        state.appUpdate ? (
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
