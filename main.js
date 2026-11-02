const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, execFile } = require("child_process");
let mainWindow = null;
let activeGame = null;
let exitAccelerator = "F10";
function registerExitShortcut(accelerator) {
  const key = String(accelerator || "F10").trim().toUpperCase();
  if (!/^(F[1-9]|F1[0-2]|[A-Z0-9])$/.test(key) || ["ENTER","ESC","ESCAPE"].includes(key)) return { ok:false, error:"Usa una tecla sencilla como F10, F11, F12 o una letra." };
  globalShortcut.unregister(exitAccelerator);
  if (!globalShortcut.register(key, () => {
    if (!activeGame || !mainWindow) return;
    const pid = activeGame.pid; activeGame = null;
    execFile("taskkill", ["/PID", String(pid), "/T", "/F"], () => {});
    mainWindow.show(); mainWindow.focus(); mainWindow.setFullScreen(true);
  })) { globalShortcut.register(exitAccelerator); return { ok:false, error:"Esa tecla ya está ocupada por Windows u otra aplicación." }; }
  exitAccelerator = key; return { ok:true, key };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 620, fullscreen: true, fullscreen: true, fullscreen: true,
    backgroundColor: "#080d19", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow = win;
  mainWindow=win;
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

ipcMain.handle("arcade:pick-cover", async () => {
  const result = await dialog.showOpenDialog({ title:"Selecciona la portada", properties:["openFile"], filters:[{name:"Imágenes",extensions:["png","jpg","jpeg","webp","bmp"]}] });
  if (result.canceled || !result.filePaths.length) return { canceled:true };
  const source=result.filePaths[0], dir=path.join(app.getPath("userData"),"covers"); fs.mkdirSync(dir,{recursive:true});
  const destination=path.join(dir,Date.now()+path.extname(source).toLowerCase()); fs.copyFileSync(source,destination); return {filePath:destination};
});
ipcMain.handle("arcade:get-exit-key", async () => exitAccelerator);
ipcMain.handle("arcade:set-exit-key", async (_event,key) => registerExitShortcut(key));
ipcMain.handle("arcade:pick-cover",async()=>{const r=await dialog.showOpenDialog({title:"Selecciona la portada",properties:["openFile"],filters:[{name:"Imágenes",extensions:["png","jpg","jpeg","webp","bmp"]}]});if(r.canceled||!r.filePaths.length)return {canceled:true};const src=r.filePaths[0],dir=path.join(app.getPath("userData"),"covers");fs.mkdirSync(dir,{recursive:true});const dest=path.join(dir,Date.now()+path.extname(src).toLowerCase());fs.copyFileSync(src,dest);return {filePath:dest}});
ipcMain.handle("arcade:get-exit-key",async()=>exitAccelerator);
ipcMain.handle("arcade:set-exit-key",async(_e,k)=>registerExitShortcut(k));
ipcMain.handle("arcade:pick-cover",async()=>{const r=await dialog.showOpenDialog({title:"Selecciona la portada",properties:["openFile"],filters:[{name:"Imágenes",extensions:["png","jpg","jpeg","webp","bmp"]}]});if(r.canceled||!r.filePaths.length)return {canceled:true};const src=r.filePaths[0],dir=path.join(app.getPath("userData"),"covers");fs.mkdirSync(dir,{recursive:true});const dest=path.join(dir,Date.now()+path.extname(src).toLowerCase());fs.copyFileSync(src,dest);return {filePath:dest}});
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
    const child = spawn(exePath, [], { cwd: path.dirname(exePath), detached: false, stdio: "ignore", windowsHide: false });
    activeGame = child;
    child.on("exit", () => { if (activeGame === child) { activeGame=null; if(mainWindow){mainWindow.show();mainWindow.focus();} } });
    child.on("error", () => { if(activeGame===child) activeGame=null; });
    setTimeout(() => execFile("powershell.exe", ["-NoProfile","-WindowStyle","Hidden","-Command","Start-Sleep -Milliseconds 1800; $w=New-Object -ComObject WScript.Shell; $w.SendKeys('%{ENTER}')"], {windowsHide:true}, () => {}), 300);
    if(mainWindow) mainWindow.minimize();
    return { ok: true };
  } catch (error) { return { ok: false, error: error.message }; }
});

app.whenReady().then(() => { registerExitShortcut("F10"); createWindow(); app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("will-quit",()=>globalShortcut.unregisterAll());
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });