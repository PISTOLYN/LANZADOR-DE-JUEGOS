const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, execFile } = require("child_process");
let mainWindow = null;
let activeGame = null;
let exitAccelerator = "F10";

function showLobby() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setFullScreen(true);
  mainWindow.show();
  mainWindow.restore();
  mainWindow.focus();
}

function registerExitShortcut(accelerator) {
  const key = String(accelerator || "F10").trim().toUpperCase();
  if (!/^(F[1-9]|F1[0-2]|[A-Z0-9])$/.test(key) || ["ENTER","ESC","ESCAPE"].includes(key)) {
    return { ok:false, error:"Usa una tecla sencilla como F10, F11, F12 o una letra." };
  }
  const previous = exitAccelerator;
  globalShortcut.unregister(previous);
  if (!globalShortcut.register(key, () => {
    const game = activeGame;
    if (!game) return;
    activeGame = null;
    if (process.platform === "win32") {
      execFile("taskkill", ["/PID", String(game.pid), "/T", "/F"], () => {});
    } else {
      try { game.kill(); } catch (_) {}
    }
    setTimeout(showLobby, 650);
  })) {
    if (previous) globalShortcut.register(previous, () => {
      const game = activeGame;
      if (!game) return;
      activeGame = null;
      execFile("taskkill", ["/PID", String(game.pid), "/T", "/F"], () => {});
      setTimeout(showLobby, 650);
    });
    return { ok:false, error:"Esa tecla ya está ocupada por Windows u otra aplicación." };
  }
  exitAccelerator = key;
  return { ok:true, key };
}
function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 620, fullscreen: true,
    backgroundColor: "#080d19", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow = win;
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
  const source=result.filePaths[0], dir=path.join(app.getPath("userData"),"covers");
  fs.mkdirSync(dir,{recursive:true});
  const destination=path.join(dir,Date.now()+path.extname(source).toLowerCase());
  fs.copyFileSync(source,destination);
  return {filePath:"file:///"+destination.replace(/\\\\/g,"/")};
});
ipcMain.handle("arcade:get-exit-key", async () => exitAccelerator);
ipcMain.handle("arcade:set-exit-key", async (_event,key) => registerExitShortcut(key));

function autoStartSettings() {
  return { path: process.execPath, args: [], name: "ARCADE LAUNCHER" };
}

ipcMain.handle("arcade:get-auto-start", async () => {
  if (process.platform !== "win32") return false;
  try {
    return Boolean(app.getLoginItemSettings(autoStartSettings()).openAtLogin);
  } catch (error) {
    console.error("No se pudo consultar el inicio automático:", error);
    return false;
  }
});

ipcMain.handle("arcade:set-auto-start", async (_event, enabled) => {
  if (process.platform !== "win32") return { ok: false, error: "Esta opción está disponible en Windows." };
  try {
    const settings = autoStartSettings();
    app.setLoginItemSettings({ ...settings, openAtLogin: Boolean(enabled) });
    const saved = Boolean(app.getLoginItemSettings(settings).openAtLogin);
    if (saved !== Boolean(enabled)) {
      return { ok: false, error: "Windows no confirmó el cambio. Ejecuta ARCADE LAUNCHER desde su instalación normal y vuelve a intentarlo." };
    }
    return { ok: true, enabled: saved };
  } catch (error) {
    console.error("Error al guardar el inicio automático:", error);
    return { ok: false, error: "Windows no permitió guardar el inicio automático: " + error.message };
  }
});

ipcMain.handle("arcade:launch-game", async (_event, rawPath) => {
  try {
    if (typeof rawPath !== "string" || /[\r\n"]/.test(rawPath)) return { ok:false, error:"La ruta del juego no es válida." };
    const exePath = path.resolve(rawPath.trim());
    if (!/^[A-Za-z]:\\/.test(exePath) && !/^\\\\/.test(exePath)) return { ok:false, error:"Escribe una ruta absoluta de Windows, por ejemplo C:\\Juegos\\MiJuego\\juego.exe." };
    if (path.extname(exePath).toLowerCase() !== ".exe") return { ok:false, error:"Selecciona un archivo .exe." };
    if (!fs.existsSync(exePath) || !fs.statSync(exePath).isFile()) return { ok:false, error:"No se encontró el EXE. Revisa la ruta en Configuración." };
    if (activeGame) return { ok:false, error:"Ya hay un juego abierto. Usa la tecla de regreso para volver a la sala." };

    const child = spawn(exePath, [], { cwd:path.dirname(exePath), detached:false, stdio:"ignore", windowsHide:false });
    activeGame = child;
    child.once("error", (error) => {
      if (activeGame === child) activeGame = null;
      showLobby();
      console.error("No se pudo iniciar el juego:", error);
    });
    child.once("exit", () => {
      if (activeGame === child) {
        activeGame = null;
        showLobby();
      }
    });

    if (mainWindow) mainWindow.minimize();

    // Intenta maximizar la ventana del juego y enviar Alt+Enter a ESE proceso,
    // no a la ventana que casualmente tenga el foco.
    if (process.platform === "win32") {
      const pid = child.pid;
      const ps = "$p=Get-Process -Id " + pid + " -ErrorAction SilentlyContinue; " +
        "for($i=0;$i -lt 30 -and $p -and $p.MainWindowHandle -eq 0;$i++){Start-Sleep -Milliseconds 500;$p.Refresh()}; " +
        "if($p -and $p.MainWindowHandle -ne 0){" +
        "Add-Type '[DllImport(\\"user32.dll\\")] public static extern bool ShowWindowAsync(IntPtr hWnd,int nCmdShow);' -Name Win -Namespace Arcade -ErrorAction SilentlyContinue; " +
        "[Arcade.Win]::ShowWindowAsync($p.MainWindowHandle,3)|Out-Null; " +
        "$w=New-Object -ComObject WScript.Shell; if($w.AppActivate($p.Id)){Start-Sleep -Milliseconds 300;$w.SendKeys('%{ENTER}')} }";
      execFile("powershell.exe", ["-NoProfile","-ExecutionPolicy","Bypass","-WindowStyle","Hidden","-Command",ps], {windowsHide:true}, (error) => {
        if (error) console.warn("No se pudo solicitar pantalla completa al juego:", error.message);
      });
    }
    return { ok:true, pid:child.pid };
  } catch (error) {
    showLobby();
    return { ok:false, error:error.message };
  }
});

app.whenReady().then(() => { registerExitShortcut("F10"); createWindow(); app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });