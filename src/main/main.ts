import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { isWowClass } from "../shared/classes";
import type { AppState, ReleaseType, SearchParams, Settings, WtfCopyRequest } from "../shared/types";
import { addonsDir } from "./game";
import { findGameFolders, resolveGameFolder } from "./gameFolder";
import { Manager } from "./manager";
import { installAppUpdate } from "./selfUpdate";
import { Store } from "./store";
import { setLanguage, t } from "../shared/i18n";

let win: BrowserWindow | null = null;
let manager: Manager;

function push(state: AppState): void {
  win?.webContents.send("state", state);
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 760,
    minHeight: 480,
    backgroundColor: "#14110f",
    title: "Forever Addons",
    // Packaged, the window takes the exe's icon; this covers `npm start`.
    ...(app.isPackaged ? {} : { icon: path.join(app.getAppPath(), "build", "icon.png") }),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "../renderer/index.html"));
  // Links open in the real browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
}

const packFilters = () => [{ name: t("Сборка Forever Addons"), extensions: ["fapack"] }];

/** Sites the renderer may open in the user's browser. */
const EXTERNAL_ALLOWED = /^https:\/\/((www\.|console\.)?curseforge\.com|github\.com)\//;

function registerIpc(): void {
  ipcMain.handle("getState", () => manager.state());
  ipcMain.handle("saveSettings", (_e, patch: Partial<Settings>) => manager.saveSettings(patch));
  ipcMain.handle("verifyKey", () => manager.verifyKey());
  ipcMain.handle("addAddon", (_e, input: string) => manager.addAddon(String(input)));
  ipcMain.handle("search", (_e, p: SearchParams) =>
    manager.cf.search(
      { query: String(p?.query ?? ""), index: Number(p?.index) || 0, sort: p?.sort ?? "popular", categoryId: p?.categoryId ? Number(p.categoryId) : null },
      manager.store.settings.flavorTypeId,
    ),
  );
  ipcMain.handle("categories", () => manager.cf.categories());
  ipcMain.handle("savePack", (_e, pack) => manager.savePack(pack));
  ipcMain.handle("deletePack", (_e, id: string) => manager.deletePack(String(id)));
  ipcMain.handle("applyPack", (_e, id: string, removeOthers: boolean, charId: unknown) =>
    manager.applyPack(String(id), !!removeOthers, charId ? String(charId) : null),
  );
  ipcMain.handle("exportPack", (_e, id: string) => manager.exportPack(String(id)));
  ipcMain.handle("importPack", (_e, code: string) => manager.importPack(String(code)));
  ipcMain.handle("exportPackFile", async (_e, id: string, charId: string) => {
    const pack = manager.store.packs.find((p) => p.id === String(id));
    const r = await dialog.showSaveDialog(win!, {
      title: t("Сохранить сборку с настройками"),
      defaultPath: `${(pack?.name ?? t("Сборка")).replace(/[\\/:*?"<>|]/g, "_")}.fapack`,
      filters: packFilters(),
    });
    if (r.canceled || !r.filePath) return false;
    manager.exportPackFile(String(id), String(charId), r.filePath);
    return true;
  });
  ipcMain.handle("importPackFile", async () => {
    const r = await dialog.showOpenDialog(win!, { title: t("Файл сборки"), properties: ["openFile"], filters: packFilters() });
    return r.canceled ? null : manager.importPackFile(r.filePaths[0]);
  });
  ipcMain.handle("wtfState", () => manager.wtfState());
  ipcMain.handle("wtfCopy", (_e, req: WtfCopyRequest) => manager.wtfCopy(req));
  ipcMain.handle("wtfRestore", (_e, id: string) => manager.wtfRestore(String(id)));
  ipcMain.handle("setCharacterClass", (_e, id: string, cls: unknown) => manager.setCharacterClass(String(id), isWowClass(cls) ? cls : null));
  ipcMain.handle("applyTimerPreset", (_e, id: string) => manager.applyTimerPreset(String(id)));
  ipcMain.handle("trackUntracked", (_e, id: number) => manager.trackUntracked(Number(id)));
  ipcMain.handle("checkUpdates", () => manager.checkUpdates());
  ipcMain.handle("install", (_e, key: string) => manager.install(String(key)));
  ipcMain.handle("updateAll", () => manager.updateAll());
  ipcMain.handle("rollback", (_e, key: string) => manager.rollback(String(key)));
  ipcMain.handle("remove", (_e, key: string) => manager.remove(String(key)));
  ipcMain.handle("setAddonChannel", (_e, key: string, t: ReleaseType | null) => manager.setAddonChannel(String(key), t));
  ipcMain.handle("openExternal", (_e, url: string) => {
    if (EXTERNAL_ALLOWED.test(String(url))) return shell.openExternal(url);
  });
  ipcMain.handle("openAddonsFolder", () => {
    const p = manager.store.settings.gamePath;
    if (p) return shell.openPath(addonsDir(p));
  });
  ipcMain.handle("findGameFolders", () => findGameFolders());
  ipcMain.handle("checkAppUpdate", () => manager.checkAppUpdate());
  ipcMain.handle("installAppUpdate", async () => {
    const update = manager.appUpdate;
    if (!update) return;
    // Set by electron-builder's portable launcher; absent when running from source.
    const exe = process.env.PORTABLE_EXECUTABLE_FILE;
    if (!exe) return shell.openExternal(update.pageUrl);
    if (manager.busy) throw new Error(t("Дождись, пока закончатся установки, и обнови программу."));
    await installAppUpdate(update, exe, (f) => manager.setAppUpdate({ ...update, progress: f ?? 0 }));
    app.quit();
  });
  ipcMain.handle("pickGameFolder", async () => {
    const r = await dialog.showOpenDialog(win!, { title: t("Папка WoW Forever"), properties: ["openDirectory"] });
    if (r.canceled) return null;
    const found = await resolveGameFolder(r.filePaths[0]);
    if (!found) throw new Error(t("В «{p0}» и рядом нет WowB.exe. Выбери папку, куда установлен WoW Forever.", { p0: r.filePaths[0] }));
    return found;
  });
}

/**
 * The portable build keeps its data in a folder next to the exe, so the app can live on a
 * flash drive or beside the game. Its first start picks up an installed copy's settings.
 */
function portableDataDir(exeDir: string): string {
  const dir = path.join(exeDir, "Forever Addons Data");
  const installed = path.join(app.getPath("appData"), "Forever Addons", "store.json");
  if (!fs.existsSync(path.join(dir, "store.json")) && fs.existsSync(installed)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(installed, path.join(dir, "store.json"));
  }
  return dir;
}

// Lets a test run use its own data folder instead of the real one.
if (process.env.FA_USER_DATA) app.setPath("userData", process.env.FA_USER_DATA);
else if (process.env.PORTABLE_EXECUTABLE_DIR) app.setPath("userData", portableDataDir(process.env.PORTABLE_EXECUTABLE_DIR));

// Two windows would overwrite each other's store.json, so a second launch just shows the first.
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (win?.isMinimized()) win.restore();
  win?.focus();
});

app.whenReady().then(async () => {
  const store = new Store(app.getPath("userData"));
  if (!store.settings.language) store.updateSettings({ language: app.getLocale().startsWith("ru") ? "ru" : "en" });
  setLanguage(store.settings.language || "ru");
  manager = new Manager(store, push, app.getVersion());
  void manager.cf.verifyKey().then(() => manager.state().then(push));
  registerIpc();
  createWindow();
  void manager.checkAppUpdate().then(push, () => {});
});

app.on("window-all-closed", () => app.quit());
