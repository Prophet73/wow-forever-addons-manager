import type { AppUpdate } from "../shared/types";
import { IconDownload, IconRefresh } from "./icons";
import { api, type Run } from "./util";

/** "A new version is out": one button downloads it and restarts the app into it. */
export function AppUpdateBanner({ update, run }: { update: AppUpdate; run: Run }) {
  const downloading = update.progress !== null;
  return (
    <div className="banner info app-update">
      <span>
        Вышла новая версия Forever Addons: <b>{update.version}</b>.{" "}
        <a href="#" onClick={(e) => (e.preventDefault(), api.openExternal(update.pageUrl))}>
          Что нового
        </a>
      </span>
      <button className="primary sm" disabled={downloading} onClick={() => run(() => api.installAppUpdate())}>
        {downloading ? (
          <>
            <IconRefresh size={14} className="spin" /> Скачиваю… {Math.round(update.progress! * 100)}%
          </>
        ) : (
          <>
            <IconDownload size={14} /> Обновить и перезапустить
          </>
        )}
      </button>
    </div>
  );
}
