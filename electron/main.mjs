import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 800,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: true,
    },
  });

  // Restrict new window/navigation by default
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  if (isDev) {
    const url = process.env.ANGULAR_DEV_URL || 'http://localhost:4200';
    return win.loadURL(url);
  }
  // Angular build output (client/dist/client/browser/index.html)
  const indexHtml = join(__dirname, '../client/dist/client/browser/index.html');
  return win.loadFile(indexHtml);
}

app.whenReady().then(() => {
  // IPC: choose export directory
  ipcMain.handle('select-export-dir', async () => {
    const res = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    });
    if (res.canceled || !res.filePaths || !res.filePaths[0]) return null;
    return res.filePaths[0];
  });

  // IPC: get app path
  ipcMain.handle('get-app-path', () => app.getAppPath());

  // IPC: get documents path
  ipcMain.handle('get-documents-path', () => app.getPath('documents'));
  // IPC: get ets2 path
  ipcMain.handle('get-ets2-path', () => {
      const documentsPath = app.getPath('documents');
      return join(documentsPath, 'Euro Truck Simulator 2');
  });

  // IPC: choose import file (live_streams.sii)
  ipcMain.handle('select-import-file', async () => {
    const res = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'SII files', extensions: ['sii'] },
        { name: 'All files', extensions: ['*'] }
      ]
    });
    if (res.canceled || !res.filePaths || !res.filePaths[0]) return null;
    return res.filePaths[0];
  });

  ipcMain.on('refocus-main-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.blur();
      win.focus();  // Or just win.focus() — blur+focus often more reliable
    }
  });
  
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
