const { app, BrowserWindow, ipcMain, dialog, globalShortcut, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { spawn, execFile } = require("child_process");
let mainWindow = null;
let returnWindow = null;
let activeGame = null;
let exitAccelerator = "F10";

/* ---------- Botón flotante "REGRESAR A LA SALA" ---------- */
const RETURN_BUTTON_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden;user-select:none}
a{display:flex;align-items:center;justify-content:center;gap:8px;box-sizing:border-box;height:100%;
  text-decoration:none;font:900 8px "Arial Black",Impact,sans-serif;letter-spacing:0;color:#fff;
  background:linear-gradient(#ffc233,#f08a00);border:1px solid #fff;border-radius:999px;
  text-shadow:0 2px 0 rgba(0,0,0,.45);box-shadow:0 4px 0 rgba(0,0,0,.4);cursor:pointer}
a:hover{background:linear-gradient(#ff6a6a,#d3151b)}
</style></head><body><a href="arcade://return">&#9664; REGRESAR A LA SALA</a></body></html>`;

function showReturnButton() {
  hideReturnButton();
  const area = screen.getPrimaryDisplay().bounds;
  const width = 104, height = 23;
  returnWindow = new BrowserWindow({
    width, height, x: area.x + area.width - width - 8, y: area.y + 8,
    frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, focusable: false, show: false, hasShadow: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  returnWindow.setAlwaysOnTop(true, "screen-saver");
  returnWindow.webContents.on("will-navigate", (event, url) => {
    event.preventDefault();
    if (url.startsWith("arcade://return")) closeActiveGame();
  });
  returnWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  returnWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(RETURN_BUTTON_HTML));
  returnWindow.once("ready-to-show", () => {
    if (returnWindow && !returnWindow.isDestroyed()) returnWindow.showInactive();
  });
}

function hideReturnButton() {
  if (returnWindow && !returnWindow.isDestroyed()) returnWindow.destroy();
  returnWindow = null;
}

/* ---------- Sala ---------- */
function showLobby() {
  hideReturnButton();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setFullScreen(true);
  mainWindow.show();
  mainWindow.restore();
  mainWindow.focus();
}

// Cierra el juego activo (y todo su árbol de procesos) y vuelve a la sala.
function closeActiveGame() {
  const game = activeGame;
  if (!game) { showLobby(); return; }
  activeGame = null;
  if (process.platform === "win32") {
    execFile("taskkill", ["/PID", String(game.pid), "/T", "/F"], () => {});
  } else {
    try { game.kill(); } catch (_) {}
  }
  hideReturnButton();
  setTimeout(showLobby, 650);
}

function registerExitShortcut(accelerator) {
  const key = String(accelerator || "F10").trim().toUpperCase();
  if (!/^(F[1-9]|F1[0-2]|[A-Z0-9])$/.test(key) || ["ENTER","ESC","ESCAPE"].includes(key)) {
    return { ok:false, error:"Usa una tecla sencilla como F10, F11, F12 o una letra." };
  }
  const previous = exitAccelerator;
  globalShortcut.unregister(previous);
  if (!globalShortcut.register(key, () => { if (activeGame) closeActiveGame(); })) {
    if (previous) globalShortcut.register(previous, () => { if (activeGame) closeActiveGame(); });
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
  return {filePath:pathToFileURL(destination).href};
});
ipcMain.handle("arcade:quit-launcher", async () => { app.quit(); return { ok:true }; });
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

// Script de PowerShell: espera la ventana del juego, le quita el borde y la
// estira sobre todo el monitor donde está (pantalla completa sin bordes).
function fullscreenScript(pid) {
  return [
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type @'",
    "using System; using System.Runtime.InteropServices;",
    "public class W {",
    '[DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int i);',
    '[DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h,int i,int v);',
    '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int cx,int cy,uint f);',
    '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int c);',
    '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);',
    '[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);',
    "}",
    "'@",
    "$p=Get-Process -Id " + pid + " -ErrorAction SilentlyContinue",
    "$h=[IntPtr]::Zero",
    "for($i=0;$i -lt 120 -and $p -and $h -eq [IntPtr]::Zero;$i++){",
    "  $p.Refresh(); if($p.MainWindowHandle -ne 0 -and [W]::IsWindowVisible($p.MainWindowHandle)){$h=$p.MainWindowHandle}",
    "  else {Start-Sleep -Milliseconds 500}",
    "}",
    "if($h -ne [IntPtr]::Zero){",
    "  $s=[System.Windows.Forms.Screen]::FromHandle($h).Bounds",
    "  for($n=0;$n -lt 8;$n++){",
    "    [W]::ShowWindow($h,3) | Out-Null",
    "    $st=[W]::GetWindowLong($h,-16)",
    "    $st=$st -band (-bnot 0x00CF0000); $st=$st -bor 0x80000000",
    "    [W]::SetWindowLong($h,-16,$st) | Out-Null",
    "    [W]::SetWindowPos($h,[IntPtr](-1),$s.X,$s.Y,$s.Width,$s.Height,0x0060) | Out-Null",
    "    [W]::SetForegroundWindow($h) | Out-Null",
    "    Start-Sleep -Milliseconds 900",
    "  }",
    "}"
  ].join("\n");
}

ipcMain.handle("arcade:launch-game", async (_event, rawPath) => {
  try {
    if (typeof rawPath !== "string" || rawPath.includes(String.fromCharCode(13)) || rawPath.includes(String.fromCharCode(10)) || rawPath.includes('"')) return { ok:false, error:"La ruta del juego no es válida." };
    const exePath = path.resolve(rawPath.trim());
    if (!/^[A-Za-z]:\\/.test(exePath) && !/^\\\\/.test(exePath)) return { ok:false, error:"Escribe una ruta absoluta de Windows, por ejemplo C:\\Juegos\\MiJuego\\juego.exe." };
    if (path.extname(exePath).toLowerCase() !== ".exe") return { ok:false, error:"Selecciona un archivo .exe." };
    if (!fs.existsSync(exePath) || !fs.statSync(exePath).isFile()) return { ok:false, error:"No se encontró el EXE. Revisa la ruta en Configuración." };
    if (activeGame) return { ok:false, error:"Ya hay un juego abierto. Usa el botón o la tecla de regreso para volver a la sala." };

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
    showReturnButton();

    if (process.platform === "win32") {
      execFile("powershell.exe", ["-NoProfile","-ExecutionPolicy","Bypass","-WindowStyle","Hidden","-Command",fullscreenScript(child.pid)], {windowsHide:true}, (error) => {
        if (error) console.warn("No se pudo poner el juego en pantalla completa:", error.message);
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
