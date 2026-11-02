const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("arcadeAPI", {
  launchGame: (exePath) => ipcRenderer.invoke("arcade:launch-game", exePath),
  pickExe: () => ipcRenderer.invoke("arcade:pick-exe"),
  pickCover:()=>ipcRenderer.invoke("arcade:pick-cover"),
  getAutoStart: () => ipcRenderer.invoke("arcade:get-auto-start"),
  setAutoStart: (enabled) => ipcRenderer.invoke("arcade:set-auto-start", enabled)
});
