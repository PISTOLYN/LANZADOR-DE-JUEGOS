const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("arcadeAPI", {
  launchGame: (exePath) => ipcRenderer.invoke("arcade:launch-game", exePath)
});