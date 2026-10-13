import { useEffect, useState } from "react";
import type { FeaturedPack } from "../../shared/types";
import { plural, t } from "../../shared/i18n";
import { IconDownload, IconPack } from "../icons";
import { cleanError, api } from "../util";

/** Ready-made packs from the repository; "Apply" downloads one and opens the apply dialog. */
export function FeaturedPacks(props: { language: string; onApply: (file: string) => Promise<void> }) {
  const [packs, setPacks] = useState<FeaturedPack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setPacks(null);
    api.featuredPacks().then(setPacks, (e) => setError(cleanError(e)));
  }, [props.language]);

  if (error) return <p className="muted small">{error}</p>;
  if (!packs?.length) return null;

  return (
    <section className="featured">
      <h3>{t("Готовые сборки")}</h3>
      <p className="muted small">{t("Настроенный интерфейс от других игроков: аддоны вместе с настройками. Нажми «Применить» и выбери персонажа.")}</p>
      <div className="pack-grid">
        {packs.map((p) => (
          <div className="pack-card featured-card" key={p.file}>
            <div className="pack-head">
              <div className="pack-icon">
                <IconPack size={22} />
              </div>
              <div>
                <div className="pack-name">{p.name}</div>
                <div className="muted small">
                  {p.addons} {plural(p.addons, "аддон", "аддона", "аддонов")} · {p.author}
                </div>
              </div>
            </div>
            <div className="pack-desc">{p.description}</div>
            <div className="pack-actions">
              <button
                className="primary sm"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(p.file);
                  await props.onApply(p.file);
                  setBusy(null);
                }}
              >
                <IconDownload size={14} /> {busy === p.file ? t("Скачиваю…") : t("Применить")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
