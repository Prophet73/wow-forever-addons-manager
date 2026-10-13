import { contextBridge, ipcRenderer } from "electron";
import type { Api, AppState } from "../shared/types";

const call =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args);

const api: Api = {
  getState: call("getState") as Api["getState"],
  saveSettings: call("saveSettings") as Api["saveSettings"],
  verifyKey: call("verifyKey") as Api["verifyKey"],
  addAddon: call("addAddon") as Api["addAddon"],
  search: call("search") as Api["search"],
  categories: call("categories") as Api["categories"],
  savePack: call("savePack") as Api["savePack"],
  deletePack: call("deletePack") as Api["deletePack"],
  applyPack: call("applyPack") as Api["applyPack"],
  exportPack: call("exportPack") as Api["exportPack"],
  importPack: call("importPack") as Api["importPack"],
  exportPackFile: call("exportPackFile") as Api["exportPackFile"],
  importPackFile: call("importPackFile") as Api["importPackFile"],
  wtfState: call("wtfState") as Api["wtfState"],
  wtfCopy: call("wtfCopy") as Api["wtfCopy"],
  wtfRestore: call("wtfRestore") as Api["wtfRestore"],
  setCharacterClass: call("setCharacterClass") as Api["setCharacterClass"],
  applyTimerPreset: call("applyTimerPreset") as Api["applyTimerPreset"],
  trackUntracked: call("trackUntracked") as Api["trackUntracked"],
  checkUpdates: call("checkUpdates") as Api["checkUpdates"],
  install: call("install") as Api["install"],
  updateAll: call("updateAll") as Api["updateAll"],
  rollback: call("rollback") as Api["rollback"],
  remove: call("remove") as Api["remove"],
  setAddonChannel: call("setAddonChannel") as Api["setAddonChannel"],
  openExternal: call("openExternal") as Api["openExternal"],
  openAddonsFolder: call("openAddonsFolder") as Api["openAddonsFolder"],
  installAppUpdate: call("installAppUpdate") as Api["installAppUpdate"],
  checkAppUpdate: call("checkAppUpdate") as Api["checkAppUpdate"],
  pickGameFolder: call("pickGameFolder") as Api["pickGameFolder"],
  findGameFolders: call("findGameFolders") as Api["findGameFolders"],
  onState(cb) {
    const listener = (_e: unknown, s: AppState) => cb(s);
    ipcRenderer.on("state", listener);
    return () => ipcRenderer.removeListener("state", listener);
  },
};

contextBridge.exposeInMainWorld("api", api);
