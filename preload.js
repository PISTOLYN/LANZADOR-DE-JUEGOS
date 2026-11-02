const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("arcadeAPI", {
  launchGame: (exePath) => ipcRenderer.invoke("arcade:launch-game", exePath),
  quitLauncher: () => ipcRenderer.invoke("arcade:quit-launcher"),
  pickExe: () => ipcRenderer.invoke("arcade:pick-exe"),
  pickCover: () => ipcRenderer.invoke("arcade:pick-cover"),
  getExitKey: () => ipcRenderer.invoke("arcade:get-exit-key"),
  setExitKey: (key) => ipcRenderer.invoke("arcade:set-exit-key", key),
  getAutoStart: () => ipcRenderer.invoke("arcade:get-auto-start"),
  setAutoStart: (enabled) => ipcRenderer.invoke("arcade:set-auto-start", enabled)
});
