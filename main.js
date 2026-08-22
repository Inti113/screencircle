const { app, BrowserWindow, ipcMain, desktopCapturer, dialog, screen, globalShortcut, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');

// ---------- scrcpy / adb (Android phone mirroring) ----------

function getScrcpyPaths() {
  if (process.platform === 'win32') {
    const dir = path.join(__dirname, 'bin', 'scrcpy-win').replace('app.asar', 'app.asar.unpacked');
    return { scrcpy: path.join(dir, 'scrcpy.exe'), adb: path.join(dir, 'adb.exe') };
  }
  // macOS / Linux: rely on a system install (e.g. `brew install scrcpy` on Mac)
  const candidates = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
  const found = candidates.find(dir => fs.existsSync(path.join(dir, 'scrcpy')));
  const dir = found || '';
  return {
    scrcpy: dir ? path.join(dir, 'scrcpy') : 'scrcpy',
    adb: dir ? path.join(dir, 'adb') : 'adb'
  };
}

let phoneMirrorProcess = null;

function runAdb(args) {
  const { adb } = getScrcpyPaths();
  return new Promise((resolve) => {
    const proc = spawn(adb, args);
    let stdout = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.on('close', () => resolve(stdout));
    proc.on('error', () => resolve(''));
  });
}

function parseAdbDevices(list) {
  return list.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('List of devices'));
}

function setupWifiForDevice(serial) {
  // Fire-and-forget: switch this USB-connected device into tcpip mode and
  // remember its Wi-Fi IP so future sessions can reconnect without a cable.
  (async () => {
    await runAdb(['-s', serial, 'tcpip', '5555']);
    await new Promise(r => setTimeout(r, 1500));
    const routeOut = await runAdb(['-s', serial, 'shell', 'ip', 'route']);
    const match = routeOut.match(/src (\d+\.\d+\.\d+\.\d+)/);
    if (match) {
      const ip = match[1];
      await runAdb(['connect', `${ip}:5555`]);
      saveSettings({ ...loadSettings(), lastPhoneIp: ip });
    }
  })();
}

ipcMain.handle('phone-check-android', async () => {
  let list = await runAdb(['devices']);
  let lines = parseAdbDevices(list);

  if (lines.length === 0) {
    const { lastPhoneIp } = loadSettings();
    if (lastPhoneIp) {
      await runAdb(['connect', `${lastPhoneIp}:5555`]);
      list = await runAdb(['devices']);
      lines = parseAdbDevices(list);
    }
  }

  if (lines.length === 0) return { connected: false };
  const [serial, status] = lines[0].split(/\s+/);
  if (status === 'unauthorized') return { connected: false, unauthorized: true };
  if (status !== 'device') return { connected: false };
  const model = (await runAdb(['-s', serial, 'shell', 'getprop', 'ro.product.model'])).trim();
  if (!serial.includes(':')) {
    setupWifiForDevice(serial);
  }
  return { connected: true, name: model || serial };
});

ipcMain.handle('phone-mirror-start', () => {
  if (phoneMirrorProcess) return true;
  const { scrcpy } = getScrcpyPaths();
  const display = screen.getPrimaryDisplay();
  const w = 320;
  const h = 640;
  const x = display.workArea.x + display.workArea.width - w - 24;
  const y = display.workArea.y + display.workArea.height - h - 24;
  try {
    phoneMirrorProcess = spawn(scrcpy, [
      '--window-title=ScreenCircle - Phone',
      `--window-x=${Math.round(x)}`,
      `--window-y=${Math.round(y)}`,
      `--window-width=${w}`,
      `--window-height=${h}`,
      '--no-audio',
      '--stay-awake'
    ]);
    phoneMirrorProcess.on('close', () => { phoneMirrorProcess = null; });
    phoneMirrorProcess.on('error', () => { phoneMirrorProcess = null; });
    return true;
  } catch (e) {
    phoneMirrorProcess = null;
    return false;
  }
});

ipcMain.handle('phone-mirror-stop', () => {
  if (phoneMirrorProcess) {
    phoneMirrorProcess.kill();
    phoneMirrorProcess = null;
  }
  return true;
});

ipcMain.handle('get-platform', () => process.platform);

let mainWindow;
let widgetWindow;
let cameraWindow;
let infoOverlayWindow;
let overlayWindows = [];

const WIDGET_SIZE = { width: 250, height: 112 };
const INFO_OVERLAY_SIZE = { width: 148, height: 40 };
const CAMERA_DEFAULT_SIZE = 200;
const CAMERA_MIN_SIZE = 100;
const CAMERA_MAX_SIZE = 480;
let cameraShape = 'circle';

// ---------- Settings (language) ----------

const SETTINGS_PATH = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH(), 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH(), JSON.stringify(settings));
  } catch (e) { /* ignore */ }
}

let currentLanguage = loadSettings().language || 'en';

ipcMain.handle('get-language', () => currentLanguage);

ipcMain.on('set-language', (event, lang) => {
  currentLanguage = lang;
  saveSettings({ ...loadSettings(), language: lang });
  [mainWindow, widgetWindow, cameraWindow, infoOverlayWindow, ...overlayWindows].forEach(win => {
    if (win && !win.isDestroyed()) win.webContents.send('language-changed', lang);
  });
});

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 730,
    minWidth: 460,
    minHeight: 500,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => {
    mainWindow = null;
    closeAllAuxWindows();
    app.quit();
  });
}

function closeAllAuxWindows() {
  [widgetWindow, cameraWindow, infoOverlayWindow, ...overlayWindows].forEach(win => {
    if (win && !win.isDestroyed()) win.destroy();
  });
  widgetWindow = null;
  cameraWindow = null;
  infoOverlayWindow = null;
  overlayWindows = [];
  if (phoneMirrorProcess) {
    phoneMirrorProcess.kill();
    phoneMirrorProcess = null;
  }
}

function createWidgetWindow() {
  widgetWindow = new BrowserWindow({
    width: WIDGET_SIZE.width,
    height: WIDGET_SIZE.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'widget-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  widgetWindow.loadFile('widget.html');
  widgetWindow.webContents.once('did-finish-load', () => {
    widgetWindow.webContents.send('language-changed', currentLanguage);
  });
}

ipcMain.on('recording-started', (event, { overlayInfoIncluded, overlayVisible = true } = {}) => {
  if (!widgetWindow) createWidgetWindow();
  const display = screen.getPrimaryDisplay();
  const margin = 16;
  const x = display.workArea.x + display.workArea.width - WIDGET_SIZE.width - margin;
  const y = display.workArea.y + margin;
  widgetWindow.setBounds({ x, y, width: WIDGET_SIZE.width, height: WIDGET_SIZE.height });
  widgetWindow.setContentProtection(true);
  widgetWindow.setAlwaysOnTop(true, 'screen-saver');
  widgetWindow.show();
  widgetWindow.webContents.once('did-finish-load', () => {
    widgetWindow.webContents.send('camera-available', !!cameraWindow);
    if (cameraWindow) widgetWindow.webContents.send('camera-visibility', cameraWindow.isVisible());
  });
  if (widgetWindow.webContents.isLoadingMainFrame() === false) {
    widgetWindow.webContents.send('camera-available', !!cameraWindow);
    if (cameraWindow) widgetWindow.webContents.send('camera-visibility', cameraWindow.isVisible());
  }

  if (overlayVisible) {
    if (!infoOverlayWindow) createInfoOverlayWindow();
    infoOverlayWindow.setContentProtection(!overlayInfoIncluded);
    infoOverlayWindow.show();
  } else if (infoOverlayWindow) {
    infoOverlayWindow.hide();
  }

  mainWindow.hide();
});

ipcMain.on('recording-stopped', () => {
  if (widgetWindow) widgetWindow.hide();
  if (infoOverlayWindow) infoOverlayWindow.hide();
  if (mainWindow) mainWindow.show();
});

ipcMain.on('widget-toggle-pause', () => {
  if (mainWindow) mainWindow.webContents.send('toggle-pause');
});

ipcMain.on('widget-stop', () => {
  if (mainWindow) mainWindow.webContents.send('request-stop');
});

ipcMain.on('recording-state-update', (event, state) => {
  if (widgetWindow) widgetWindow.webContents.send('recording-state', state);
  if (infoOverlayWindow) infoOverlayWindow.webContents.send('recording-state', state);
});

// ---------- Info overlay window (date/time + duration) ----------

function createInfoOverlayWindow() {
  const display = screen.getPrimaryDisplay();
  const margin = 16;
  infoOverlayWindow = new BrowserWindow({
    x: display.workArea.x + margin,
    y: display.workArea.y + margin,
    width: INFO_OVERLAY_SIZE.width,
    height: INFO_OVERLAY_SIZE.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'info-overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  infoOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
  infoOverlayWindow.loadFile('info-overlay.html');
  infoOverlayWindow.webContents.once('did-finish-load', () => {
    infoOverlayWindow.webContents.send('language-changed', currentLanguage);
  });
  infoOverlayWindow.on('closed', () => { infoOverlayWindow = null; });
}

ipcMain.on('overlay-info-set-included', (event, included) => {
  if (infoOverlayWindow) infoOverlayWindow.setContentProtection(!included);
});

// ---------- Camera window ----------

function createCameraWindow() {
  const display = screen.getPrimaryDisplay();
  const margin = 24;
  const size = CAMERA_DEFAULT_SIZE;
  const x = display.workArea.x + display.workArea.width - size - margin;
  const y = display.workArea.y + display.workArea.height - size - margin;

  cameraWindow = new BrowserWindow({
    x, y,
    width: size,
    height: size,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'camera-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  cameraWindow.setAlwaysOnTop(true, 'screen-saver');
  cameraWindow.loadFile('camera.html');
  cameraWindow.webContents.once('did-finish-load', () => {
    cameraWindow.webContents.send('set-shape', cameraShape);
    cameraWindow.webContents.send('language-changed', currentLanguage);
  });
  cameraWindow.on('closed', () => { cameraWindow = null; });
}

ipcMain.on('camera-set-shape', (event, shape) => {
  cameraShape = shape;
  if (cameraWindow) cameraWindow.webContents.send('set-shape', shape);
});

ipcMain.on('camera-show', () => {
  if (!cameraWindow) createCameraWindow();
  cameraWindow.show();
});

ipcMain.on('camera-hide', () => {
  if (cameraWindow) cameraWindow.hide();
});

ipcMain.on('camera-set-included', (event, included) => {
  if (cameraWindow) cameraWindow.setContentProtection(!included);
});

ipcMain.on('camera-toggle', () => {
  if (!cameraWindow) return;
  if (cameraWindow.isVisible()) {
    cameraWindow.hide();
  } else {
    cameraWindow.show();
  }
  if (widgetWindow) widgetWindow.webContents.send('camera-visibility', cameraWindow.isVisible());
});

ipcMain.on('camera-resize', (event, delta) => {
  if (!cameraWindow) return;
  const bounds = cameraWindow.getBounds();
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  let newSize = Math.round(bounds.width + delta);
  newSize = Math.max(CAMERA_MIN_SIZE, Math.min(CAMERA_MAX_SIZE, newSize));
  cameraWindow.setBounds({
    x: Math.round(cx - newSize / 2),
    y: Math.round(cy - newSize / 2),
    width: newSize,
    height: newSize
  });
});

app.whenReady().then(() => {
  createMainWindow();

  globalShortcut.register('CommandOrControl+Shift+R', () => {
    if (mainWindow) mainWindow.webContents.send('hotkey-start');
  });
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    if (mainWindow) mainWindow.webContents.send('hotkey-pause');
  });
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (mainWindow) mainWindow.webContents.send('hotkey-stop');
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (phoneMirrorProcess) phoneMirrorProcess.kill();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

// ---------- Sources ----------

ipcMain.handle('get-sources', async (event, types) => {
  const sources = await desktopCapturer.getSources({
    types,
    thumbnailSize: { width: 240, height: 160 }
  });
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL()
  }));
});

ipcMain.handle('get-screen-info', () => {
  const display = screen.getPrimaryDisplay();
  return {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor)
  };
});

ipcMain.handle('get-primary-screen-source', async () => {
  const primary = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1, height: 1 }
  });
  const match = sources.find(s => String(s.display_id) === String(primary.id)) || sources[0];
  return match ? { id: match.id, name: match.name } : null;
});

// ---------- Region selection ----------

ipcMain.handle('select-region', async () => {
  return new Promise((resolve) => {
    const displays = screen.getAllDisplays();
    let resolved = false;

    const closeAllOverlays = () => {
      overlayWindows.forEach(w => { if (!w.isDestroyed()) w.close(); });
      overlayWindows = [];
    };

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      closeAllOverlays();
      resolve(result);
    };

    displays.forEach(display => {
      const win = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        hasShadow: false,
        fullscreenable: false,
        webPreferences: {
          preload: path.join(__dirname, 'overlay-preload.js'),
          contextIsolation: true,
          nodeIntegration: false
        }
      });
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setIgnoreMouseEvents(false);
      win.loadFile('overlay.html');
      win.webContents.once('did-finish-load', () => {
        win.webContents.send('language-changed', currentLanguage);
      });
      win.displayInfo = display;
      overlayWindows.push(win);
    });

    ipcMain.once('region-selected', async (event, data) => {
      if (!data) {
        finish(null);
        return;
      }
      const senderWin = BrowserWindow.fromWebContents(event.sender);
      const display = senderWin ? senderWin.displayInfo : screen.getPrimaryDisplay();

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 }
      });
      const match = sources.find(s => String(s.display_id) === String(display.id)) || sources[0];

      finish({
        sourceId: match ? match.id : null,
        x: Math.round(data.x * display.scaleFactor),
        y: Math.round(data.y * display.scaleFactor),
        width: Math.round(data.width * display.scaleFactor),
        height: Math.round(data.height * display.scaleFactor),
        nativeWidth: Math.round(display.size.width * display.scaleFactor),
        nativeHeight: Math.round(display.size.height * display.scaleFactor)
      });
    });

    ipcMain.once('region-cancelled', () => finish(null));
  });
});

ipcMain.on('show-item-in-folder', (event, filePath) => {
  shell.showItemInFolder(filePath);
});

// ---------- Save dialog ----------

const FORMAT_FILTERS = {
  mp4: { name: 'MP4 Video', extensions: ['mp4'] },
  mov: { name: 'QuickTime Video', extensions: ['mov'] },
  avi: { name: 'AVI Video', extensions: ['avi'] },
  webm: { name: 'WebM Video', extensions: ['webm'] }
};

const SAVE_DIALOG_TITLES = {
  en: 'Save Recording', ru: 'Сохранить запись', de: 'Aufnahme speichern',
  es: 'Guardar grabación', fr: 'Enregistrer la vidéo', pt: 'Salvar gravação',
  it: 'Salva registrazione', tr: 'Kaydı Kaydet', az: 'Qeydi yadda saxla',
  hi: 'रिकॉर्डिंग सहेजें', ar: 'حفظ التسجيل'
};

ipcMain.handle('choose-save-path', async (event, format) => {
  const fmt = FORMAT_FILTERS[format] ? format : 'mp4';
  const filter = FORMAT_FILTERS[fmt];
  const result = await dialog.showSaveDialog(mainWindow, {
    title: SAVE_DIALOG_TITLES[currentLanguage] || SAVE_DIALOG_TITLES.en,
    defaultPath: path.join(app.getPath('videos'), `ScreenCircle-${Date.now()}.${filter.extensions[0]}`),
    filters: [filter]
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
});

// ---------- Recording conversion ----------

function getFormatArgs(format) {
  if (format === 'webm') {
    return ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-c:a', 'libopus'];
  }
  if (format === 'avi') {
    return ['-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'libmp3lame'];
  }
  // mp4 / mov
  return ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart'];
}

ipcMain.handle('save-recording', async (event, { buffer, outputPath, crop, format }) => {
  const tempPath = path.join(os.tmpdir(), `screencircle-${Date.now()}.webm`);
  fs.writeFileSync(tempPath, Buffer.from(buffer));

  const args = ['-y', '-i', tempPath];
  if (crop) {
    args.push('-vf', `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`);
  }
  args.push(...getFormatArgs(format), outputPath);

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      try { fs.unlinkSync(tempPath); } catch (e) { /* ignore */ }
      if (code === 0) {
        resolve({ success: true, outputPath });
      } else {
        resolve({ success: false, error: stderr.slice(-2000) });
      }
    });
    proc.on('error', err => {
      resolve({ success: false, error: err.message });
    });
  });
});
