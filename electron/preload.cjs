// Preload runs in an isolated, privileged context. Keep the surface minimal.
const { contextBridge, ipcRenderer } = require('electron');
const { resolve, join, isAbsolute, dirname } = require('node:path');
const { pathToFileURL } = require('node:url');

async function importModule(p) {
  const full = resolve(__dirname, p);
  return import(pathToFileURL(full).toString());
}

contextBridge.exposeInMainWorld('api', {
  /**
   * @param {{ name?: string, tag?: string, country?: string, language?: string, limit?: number }} [filters]
   * @returns {Promise<import('../utils/live-streams/fetch-public-stations.js').PublicStation[]>}
   */
  async fetchPublicStations(filters) {
    const { fetchPublicStations } = await importModule('../utils/live-streams/fetch-public-stations.js');
    return fetchPublicStations(filters);
  },

  /**
   * @param {string} [filePath]
   * @param {import('../utils/live-streams/find-current-channels.js').SearchOptions|string} [search]
   * @returns {Promise<{ total:number, filteredCount:number, channels:any[] }>}
   */
  async findGameChannels(filePath, search) {
    const { findCurrentChannels } = await importModule('../utils/live-streams/find-current-channels.js');
    return findCurrentChannels(filePath, search);
  },

  /**
   * @param {string} filePath
   * @param {number|number[]} indexOrIndexes
   * @param {boolean} [setFavorite=true]
   * @returns {Promise<void>}
   */
  async markFavorite(filePath, indexOrIndexes, setFavorite = true) {
    const { markFavorite } = await importModule('../utils/live-streams/mark-favorite.js');
return markFavorite(filePath, indexOrIndexes, setFavorite);
  },

  /**
   * Let user pick a target directory and copy a live_streams.sii there.
   * @param {string} [sourcePath='live_streams.sii']
   * @param {string} [fileName='live_streams.sii']
   * @returns {Promise<{canceled:boolean, destPath?:string}>}
   */
  async exportLiveStreams(sourcePath = 'live_streams.sii', fileName = 'live_streams.sii') {
    const destDir = await ipcRenderer.invoke('select-export-dir');
    if (!destDir) return { canceled: true };
    const fs = require('node:fs/promises');
    const absSrc = isAbsolute(sourcePath) ? sourcePath : resolve(process.cwd(), sourcePath);
    const destPath = join(destDir, fileName);
    await fs.copyFile(absSrc, destPath);
    return { canceled: false, destPath };
  },

  /**
   * Pick a file and replace the target live_streams.sii on disk.
   * @param {string} [targetPath='live_streams.sii']
   * @returns {Promise<{canceled:boolean, srcPath?:string, destPath?:string}>}
   */
  async importLiveStreams(targetPath = 'live_streams.sii') {
    const srcPath = await ipcRenderer.invoke('select-import-file');
    if (!srcPath) return { canceled: true };
    return this.importLiveStreamsFromPath(srcPath, targetPath);
  },

  /** Pick a file path for import (no reading/copying). */
  async chooseImportFile() {
    return ipcRenderer.invoke('select-import-file');
  },

  /** Read a text file (utf8). */
  async readTextFile(filePath) {
    const fs = require('node:fs/promises');
    return fs.readFile(filePath, 'utf8');
  },

  /** Copy from an explicit source path to target (default live_streams.sii) with backup rotation. */
  async importLiveStreamsFromPath(srcPath, targetPath = 'live_streams.sii') {
    const fs = require('node:fs/promises');
    const absDest = isAbsolute(targetPath) ? targetPath : resolve(process.cwd(), targetPath);

    // Create backup if destination exists
    try {
      const stat = await fs.stat(absDest).catch(() => null);
      if (stat && stat.isFile()) {
        const backupsRoot = join(dirname(absDest), 'backups', 'live_streams');
        await fs.mkdir(backupsRoot, { recursive: true });
        const ts = new Date();
        const pad = (n, w=2) => String(n).padStart(w, '0');
        const name = `live_streams_${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}-${pad(ts.getMilliseconds(),3)}.sii`;
        const backupPath = join(backupsRoot, name);
        await fs.copyFile(absDest, backupPath);
        // Rotation: keep 10 newest
        try {
          const entries = await fs.readdir(backupsRoot, { withFileTypes: true });
          const files = entries.filter(e => e.isFile() && e.name.endsWith('.sii'))
            .map(e => ({ name: e.name, path: join(backupsRoot, e.name) }));
          // sort by name descending (timestamp embedded), newest first
          files.sort((a,b) => b.name.localeCompare(a.name));
          const toDelete = files.slice(10);
          await Promise.allSettled(toDelete.map(f => fs.unlink(f.path)));
        } catch {}
      }
    } catch {}

    // Replace destination with source
    await fs.copyFile(srcPath, absDest);
    return { canceled: false, srcPath, destPath: absDest };
  }
});
