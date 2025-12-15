import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
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

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
