import { IconExternal } from "./icons";
import { api } from "./util";
import { t } from "../shared/i18n";

const CONSOLE_URL = "https://console.curseforge.com/";

/** Steps to get a personal CurseForge API key; each user needs their own (CurseForge rules). */
export function KeyGuide() {
  return (
    <ol className="key-guide">
      <li>
        {t("Открой сайт CurseForge для разработчиков и войди или зарегистрируйся. Это бесплатно.")}{" "}
        <button className="sm" onClick={() => api.openExternal(CONSOLE_URL)}>
          <IconExternal size={14} /> console.curseforge.com
        </button>
      </li>
      <li>{t("Если сайт попросит название организации, впиши любое, например свой ник.")}</li>
      <li>
        {t("Слева открой")} <b>API Keys</b> {t("и скопируй ключ. Он длинный и начинается с")} <span className="mono">$2a$10$</span>.
      </li>
      <li>{t("Вставь его в поле ниже.")}</li>
    </ol>
  );
}
