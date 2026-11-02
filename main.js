const { app, BrowserWindow, ipcMain, dialog, globalShortcut, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { spawn, execFile } = require("child_process");
let mainWindow = null;
let returnWindow = null;
let activeGame = null;
let exitAccelerator = "F10";

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

function showLobby() {
  hideReturnButton();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setFullScreen(true);
  mainWindow.show();
  mainWindow.restore();
  mainWindow.focus();
}

function closeActiveGame() {
  const game = activeGame;
  if (!game) { showLobby(); return; }
  activeGame = null;
  if (game.monitor) clearInterval(game.monitor);
  if (process.platform === "win32") {
    const pids = new Set([game.pid, ...(game.trackedPids || [])]);
    for (const pid of pids) execFile("taskkill", ["/PID", String(pid), "/T", "/F"], () => {});
  } else {
    try { game.child.kill(); } catch (_) {}
  }
  hideReturnButton();
  setTimeout(showLobby, 650);
}

function refreshGameProcesses(game) {
  if (process.platform !== "win32" || activeGame !== game || game.checking) return;
  game.checking = true;
  const seeds = [game.pid, ...game.trackedPids];
  const script = "$seeds=@(" + seeds.join(",") + ");" +
    "$all=Get-CimInstance Win32_Process -ErrorAction SilentlyContinue;" +
    "$ids=@($seeds);$changed=$true;" +
    "while($changed){$changed=$false;foreach($p in $all){" +
    "if(($ids -contains [int]$p.ParentProcessId) -and ($ids -notcontains [int]$p.ProcessId)){" +
    "$ids+=([int]$p.ProcessId);$changed=$true}}};" +
    "$ids | ConvertTo-Json -Compress";
  execFile("powershell.exe", ["-NoProfile","-ExecutionPolicy","Bypass","-WindowStyle","Hidden","-Command",script],
    {windowsHide:true,timeout:12000,maxBuffer:1024*1024}, (error, stdout) => {
      game.checking = false;
      if (activeGame !== game) return;
      if (!error) {
        try {
          const found = JSON.parse(stdout.trim() || "[]");
          for (const pid of (Array.isArray(found) ? found : [found])) {
            if (Number.isInteger(Number(pid)) && Number(pid) !== game.pid) game.trackedPids.add(Number(pid));
          }
        } catch (_) {}
      }
      const live = new Set([game.pid, ...game.trackedPids]);
      execFile("powershell.exe", ["-NoProfile","-ExecutionPolicy","Bypass","-WindowStyle","Hidden","-Command",
        "$ids=@(" + [...live].join(",") + ");foreach($id in $ids){if(Get-Process -Id $id -ErrorAction SilentlyContinue){Write-Output $id}}"],
        {windowsHide:true,timeout:8000}, (_err, output) => {
          if (activeGame !== game) return;
          const alive = String(output || "").trim().split(/\s+/).filter(Boolean);
          if (!alive.length) {
            activeGame = null;
            clearInterval(game.monitor);
            hideReturnButton();
            showLobby();
          }
        });
    });
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

ipcMain.handle("arcade:quit-launcher", async () => {
  app.exit(0);
  return { ok:true };
});

const libraryFile = path.join(app.getPath("userData"), "games-library.json");
ipcMain.handle("arcade:load-library", async () => {
  try {
    if (!fs.existsSync(libraryFile)) return { ok:true, games:null };
    const data = JSON.parse(fs.readFileSync(libraryFile, "utf8"));
    return { ok:true, games:Array.isArray(data) ? data : null };
  } catch (error) {
    return { ok:false, error:"No se pudo leer la colección guardada: " + error.message };
  }
});
ipcMain.handle("arcade:save-library", async (_event, games) => {
  try {
    if (!Array.isArray(games)) return { ok:false, error:"La colección de juegos no es válida." };
    const safeGames = games.map(g => ({
      title:String(g?.title || "JUEGO"),
      subtitle:String(g?.subtitle || ""),
      exePath:String(g?.exePath || ""),
      cover:String(g?.cover || "")
    }));
    fs.mkdirSync(path.dirname(libraryFile), { recursive:true });
    const tempFile = libraryFile + ".tmp";
    fs.writeFileSync(tempFile, JSON.stringify(safeGames, null, 2), "utf8");
    fs.renameSync(tempFile, libraryFile);
    return { ok:true };
  } catch (
