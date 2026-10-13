import { useEffect, useState } from "react";
import { addonKey } from "../../shared/addon";
import type { ApplyPackResult, Pack, PackAddon, TrackedAddon, WtfCharacter } from "../../shared/types";
import { IconCopy, IconDownload, IconEdit, IconFolder, IconPack, IconPlay, IconPlus, IconShare, IconTrash } from "../icons";
import { Avatar, Banner, Checkbox, Empty, Modal, PageHeader } from "../ui";
import { api, cleanError, formatDate, plural, type ViewProps } from "../util";

function toPackAddon(a: TrackedAddon): PackAddon {
  return { provider: a.provider, id: a.id, name: a.name };
}

export function PacksView({ state, run }: ViewProps) {
  const [editing, setEditing] = useState<Partial<Pack> | null>(null);
  const [importing, setImporting] = useState(false);
  const [sharing, setSharing] = useState<{ pack: Pack; code: string } | null>(null);
  const [applying, setApplying] = useState<Pack | null>(null);

  const fromInstalled = (): Partial<Pack> => ({
    name: "",
    description: "",
    addons: state.addons.map(toPackAddon),
  });

  return (
    <div className="page">
      <PageHeader
        title="Сборки"
        subtitle="Наборы аддонов: поставить всё одной кнопкой или поделиться с другом кодом или файлом с настройками"
        actions={
          <>
            <button onClick={() => run(async () => (await api.importPackFile()) ?? undefined)}>
              <IconFolder size={16} /> Открыть файл
            </button>
            <button onClick={() => setImporting(true)}>
              <IconCopy size={16} /> Вставить код
            </button>
            <button className="primary" onClick={() => setEditing(fromInstalled())} disabled={!state.addons.length}>
              <IconPlus size={16} /> Сборка из установленных
            </button>
          </>
        }
      />

      {state.packs.length === 0 ? (
        <Empty icon={<IconPack size={40} />} title="Сборок пока нет">
          <p>Сохрани текущий набор аддонов как сборку или вставь код сборки от друга.</p>
        </Empty>
      ) : (
        <div className="pack-grid">
          {state.packs.map((p) => {
            const installed = p.addons.filter((a) => state.addons.some((t) => t.key === addonKey(a) && t.installed)).length;
            return (
              <div className="pack-card" key={p.id}>
                <div className="pack-head">
                  <div className="pack-icon">
                    <IconPack size={22} />
                  </div>
                  <div>
                    <div className="pack-name">{p.name}</div>
                    <div className="muted small">
                      {p.addons.length} {plural(p.addons.length, "аддон", "аддона", "аддонов")} · стоит {installed} из {p.addons.length} · {formatDate(p.updatedAt)}
                    </div>
                  </div>
                </div>
                {p.description && <div className="pack-desc">{p.description}</div>}
                {p.settings && (
                  <div className="pack-settings small">
                    + настройки интерфейса с {p.settings.from.split("-")[0]} ({p.settings.files} {plural(p.settings.files, "файл", "файла", "файлов")})
                  </div>
                )}
                <div className="pack-addons">
                  {p.addons.slice(0, 8).map((a) => (
                    <span className="pack-chip" key={addonKey(a)} title={a.name}>
                      {a.name}
                    </span>
                  ))}
                  {p.addons.length > 8 && <span className="pack-chip muted">+{p.addons.length - 8}</span>}
                </div>
                <div className="pack-actions">
                  <button className="primary sm" onClick={() => setApplying(p)} disabled={state.gameRunning}>
                    <IconPlay size={14} /> Применить
                  </button>
                  <button
                    className="sm"
                    onClick={async () => {
                      try {
                        setSharing({ pack: p, code: await api.exportPack(p.id) });
                      } catch (e) {
                        alert(cleanError(e));
                      }
                    }}
                  >
                    <IconShare size={14} /> Поделиться
                  </button>
                  <button className="sm icon-only" title="Изменить" onClick={() => setEditing(p)}>
                    <IconEdit size={14} />
                  </button>
                  <button
                    className="sm icon-only danger"
                    title="Удалить сборку"
                    onClick={() => confirm(`Удалить сборку «${p.name}»? Аддоны останутся установленными.`) && run(() => api.deletePack(p.id))}
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <PackEditor initial={editing} state={state} run={run} onClose={() => setEditing(null)} />}
      {importing && <ImportDialog run={run} onClose={() => setImporting(false)} />}
      {sharing && <ShareDialog {...sharing} onClose={() => setSharing(null)} />}
      {applying && <ApplyDialog pack={applying} state={state} onClose={() => setApplying(null)} />}
    </div>
  );
}

function PackEditor(props: { initial: Partial<Pack>; state: ViewProps["state"]; run: ViewProps["run"]; onClose: () => void }) {
  const { initial, state } = props;
  const [name, setName] = useState(initial.name ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  // Everything that can be in the pack: installed addons plus addons already listed in it.
  const pool: PackAddon[] = [...(initial.addons ?? [])];
  for (const a of state.addons) if (!pool.some((p) => addonKey(p) === a.key)) pool.push(toPackAddon(a));
  pool.sort((a, b) => a.name.localeCompare(b.name));
  const [selected, setSelected] = useState<Set<string>>(new Set((initial.addons ?? []).map(addonKey)));

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const save = async () => {
    const ok = await props.run(() =>
      api.savePack({ id: initial.id, name, description, addons: pool.filter((a) => selected.has(addonKey(a))) }),
    );
    if (ok) props.onClose();
  };

  return (
    <Modal
      title={initial.id ? "Изменить сборку" : "Новая сборка"}
      onClose={props.onClose}
      wide
      footer={
        <>
          <button onClick={props.onClose}>Отмена</button>
          <button className="primary" onClick={save} disabled={!name.trim() || selected.size === 0}>
            Сохранить
          </button>
        </>
      }
    >
      <label>
        Название
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Хил-друид, рейд" />
      </label>
      <label>
        Описание <span className="muted">(необязательно)</span>
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Для чего сборка, что в ней важного" />
      </label>
      <div className="label-row">
        <span>
          Аддоны <span className="muted">({selected.size})</span>
        </span>
        <span className="link-group">
          <button className="link" onClick={() => setSelected(new Set(pool.map(addonKey)))}>
            все
          </button>
          <button className="link" onClick={() => setSelected(new Set())}>
            никого
          </button>
        </span>
      </div>
      <div className="check-list">
        {pool.map((a) => (
          <Checkbox key={addonKey(a)} checked={selected.has(addonKey(a))} onChange={(v) => toggle(addonKey(a), v)}>
            <Avatar name={a.name} size={22} /> {a.name}
          </Checkbox>
        ))}
      </div>
    </Modal>
  );
}

function ImportDialog(props: { run: ViewProps["run"]; onClose: () => void }) {
  const [code, setCode] = useState("");
  const submit = async () => {
    if (await props.run(() => api.importPack(code))) props.onClose();
  };
  return (
    <Modal
      title="Вставить код сборки"
      onClose={props.onClose}
      footer={
        <>
          <button onClick={props.onClose}>Отмена</button>
          <button className="primary" onClick={submit} disabled={!code.trim()}>
            Добавить сборку
          </button>
        </>
      }
    >
      <label>
        Код от друга
        <textarea autoFocus rows={4} value={code} onChange={(e) => setCode(e.target.value)} placeholder="FA1.…" className="mono" />
      </label>
      <p className="muted small">Сборка появится в списке. Потом нажми «Применить», чтобы поставить аддоны.</p>
    </Modal>
  );
}

/** The player's characters, most recently played first. */
function useCharacters(): WtfCharacter[] {
  const [chars, setChars] = useState<WtfCharacter[]>([]);
  useEffect(() => {
    api.wtfState().then((s) => setChars(s.characters), () => setChars([]));
  }, []);
  return chars;
}

function CharacterSelect(props: { characters: WtfCharacter[]; value: string; onChange: (id: string) => void }) {
  return (
    <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
      {props.characters.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function ShareDialog(props: { pack: Pack; code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const characters = useCharacters();
  const [charId, setCharId] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const from = charId || characters[0]?.id || "";

  const saveFile = async () => {
    try {
      if (await api.exportPackFile(props.pack.id, from)) setSaved("Файл сохранён. Отправь его другу, он откроет его в Forever Addons: Сборки → «Открыть файл».");
    } catch (e) {
      setSaved(cleanError(e));
    }
  };
  return (
    <Modal
      title={`Поделиться «${props.pack.name}»`}
      onClose={props.onClose}
      footer={
        <>
          <button onClick={props.onClose}>Закрыть</button>
          <button
            className="primary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(props.code);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            <IconCopy size={16} /> {copied ? "Скопировано" : "Скопировать код"}
          </button>
        </>
      }
    >
      <h3 className="share-title">Только аддоны: код</h3>
      <p>Отправь этот код другу. В Forever Addons: Сборки → «Вставить код».</p>
      <textarea readOnly rows={4} value={props.code} className="mono" onFocus={(e) => e.currentTarget.select()} />
      <h3 className="share-title">Аддоны и мой интерфейс: файл</h3>
      <p className="muted small">
        Расположение окон, бинды, макросы, чат и настройки аддонов из сборки. Графика и звук не попадают, личная переписка тоже.
      </p>
      {characters.length > 0 ? (
        <div className="row">
          <CharacterSelect characters={characters} value={from} onChange={setCharId} />
          <button onClick={saveFile} disabled={!from}>
            <IconDownload size={16} /> Сохранить файл…
          </button>
        </div>
      ) : (
        <p className="muted small">Персонажей не найдено: зайди в игру хотя бы раз.</p>
      )}
      {saved && <Banner kind="info">{saved}</Banner>}
    </Modal>
  );
}

function ApplyDialog(props: { pack: Pack; state: ViewProps["state"]; onClose: () => void }) {
  const { pack, state } = props;
  const [removeOthers, setRemoveOthers] = useState(false);
  const characters = useCharacters();
  const [withSettings, setWithSettings] = useState(!!pack.settings);
  const [charId, setCharId] = useState("");
  const target = charId || characters[0]?.id || "";
  const settingsOn = !!pack.settings && withSettings && !!target;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApplyPackResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const inPack = new Set(pack.addons.map(addonKey));
  const missing = pack.addons.filter((a) => !state.addons.some((t) => t.key === addonKey(a) && t.installed));
  const extra = state.addons.filter((a) => !inPack.has(a.key));

  const apply = async () => {
    setErr(null);
    const name = characters.find((c) => c.id === target)?.name;
    if (settingsOn && !confirm(`Заменить интерфейс ${name} настройками из сборки? Текущие файлы сохранятся в бэкап (Персонажи → Бэкапы).`)) return;
    setBusy(true);
    try {
      setResult(await api.applyPack(pack.id, removeOthers, settingsOn ? target : null));
    } catch (e) {
      setErr(cleanError(e));
    }
    setBusy(false);
  };

  return (
    <Modal
      title={`Применить «${pack.name}»`}
      onClose={props.onClose}
      footer={
        result ? (
          <button className="primary" onClick={props.onClose}>
            Готово
          </button>
        ) : (
          <>
            <button onClick={props.onClose}>Отмена</button>
            <button
              className="primary"
              onClick={apply}
              disabled={busy || (settingsOn && state.gameRunning) || (missing.length === 0 && !settingsOn && !(removeOthers && extra.length))}
            >
              {busy ? "Запускаю…" : "Применить"}
            </button>
          </>
        )
      }
    >
      {result ? (
        <>
          <p>
            Поставлено в очередь: <b>{result.queued}</b>, уже стояло: <b>{result.alreadyInstalled}</b>
            {result.removed > 0 && (
              <>
                , удаляется: <b>{result.removed}</b>
              </>
            )}
            . Прогресс видно в «Загрузках».
          </p>
          {result.settingsFiles > 0 && <p>Настройки интерфейса записаны ({result.settingsFiles} файлов). Можно заходить в игру.</p>}
          {result.failed.length > 0 && <Banner kind="warn">{result.failed.join("\n")}</Banner>}
        </>
      ) : (
        <>
          <p>
            {missing.length
              ? `Будет установлено: ${missing.length} ${plural(missing.length, "аддон", "аддона", "аддонов")}.`
              : "Все аддоны из сборки уже стоят."}
          </p>
          {missing.length > 0 && (
            <div className="pack-addons">
              {missing.map((a) => (
                <span className="pack-chip" key={addonKey(a)}>
                  {a.name}
                </span>
              ))}
            </div>
          )}
          {extra.length > 0 && (
            <Checkbox checked={removeOthers} onChange={setRemoveOthers}>
              Удалить аддоны не из сборки ({extra.length}): {extra.map((a) => a.name).join(", ")}
            </Checkbox>
          )}
          {pack.settings && (
            <div className="apply-settings">
              <Checkbox checked={withSettings} onChange={setWithSettings}>
                Настройки интерфейса с {pack.settings.from.split("-")[0]} на персонажа:
              </Checkbox>
              {characters.length > 0 ? (
                <CharacterSelect characters={characters} value={target} onChange={setCharId} />
              ) : (
                <span className="muted small">персонажей нет: зайди в игру хотя бы раз</span>
              )}
            </div>
          )}
          {settingsOn && state.gameRunning && <Banner kind="warn">Закрой игру: она перезапишет настройки при выходе.</Banner>}
          {err && <Banner kind="error">{err}</Banner>}
        </>
      )}
    </Modal>
  );
}
