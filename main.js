const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 620,
    backgroundColor: "#080d19", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadFile("index.html");
}

ipcMain.handle("arcade:pick-exe", async () => {
  const result = await dialog.showOpenDialog({
    title: "Selecciona el juego que quieres agregar",
    properties: ["openFile"],
    filters: [{ name: "Juegos y aplicaciones", extensions: ["exe"] }]
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  return { filePath: result.filePaths[0] };
});

ipcMain.handle("arcade:get-auto-start", async () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle("arcade:set-auto-start", async (_event, enabled) => {
  if (process.platform !== "win32") return { ok: false, error: "Esta opción está disponible en Windows." };
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    path: process.execPath,
    args: []
  });
  return { ok: app.getLoginItemSettings().openAtLogin };
});

ipcMain.handle("arcade:launch-game", async (_event, rawPath) => {
  try {
    if (typeof rawPath !== "string" || /[\r\n"]/ .test(rawPath)) return { ok: false, error: "La ruta del juego no es válida." };
    const exePath = path.resolve(rawPath.trim());
    if (!/^[A-Za-z]:\\/.test(exePath) && !/^\\\\/.test(exePath)) return { ok: false, error: "Escribe una ruta absoluta de Windows, por ejemplo C:\\Juegos\\MiJuego\\juego.exe." };
    if (path.extname(exePath).toLowerCase() !== ".exe") return { ok: false, error: "Selecciona un archivo .exe." };
    if (!fs.existsSync(exePath) || !fs.statSync(exePath).isFile()) return { ok: false, error: "No se encontró el EXE. Revisa la ruta en Configuración." };
    const child = spawn(exePath, [], { cwd: path.dirname(exePath), detached: true, stdio: "ignore", windowsHide: false });
    child.unref();
    return { ok: true };
  } catch (error) { return { ok: false, error: error.message }; }
});

app.whenReady().then(() => { createWindow(); app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });