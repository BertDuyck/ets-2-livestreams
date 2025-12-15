// Preload runs in an isolated, privileged context. Keep the surface minimal.
const { contextBridge, ipcRenderer } = require('electron');
const { resolve, join, isAbsolute, dirname } = require('node:path');
const { readFileSync } = require('node:fs');
const fs = require('node:fs/promises');

// Embed the channel parsing logic directly to avoid dynamic import issues in production
function parseChannels(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const entryRegex = /^\s*stream_data\[(\d+)\]:\s*"([^"]*)"/;
    const entries = [];
    
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(entryRegex);
      if (m) {
        const idx = Number(m[1]);
        const payload = m[2];
        entries.push({ idx, payload });
      }
    }
    
    return entries
      .sort((a, b) => a.idx - b.idx)
      .map(e => {
        const fields = e.payload.split('|');
        const [url = '', name = '', genre = '', lang = 'EN', bitrate = '', favorite = '0'] = fields;
        return { index: e.idx, url, name, genre, lang, bitrate, favorite };
      });
  } catch (error) {
    console.error('Error parsing channels:', error);
    throw error;
  }
}

function findCurrentChannels(filePath, search) {
  try {
    const channels = parseChannels(filePath);
    const total = channels.length;
    
    if (!search || (typeof search === 'string' && search.trim() === '')) {
      return { total, filteredCount: total, channels };
    }
    
    // Simple substring search for now
    const query = String(search).toLowerCase();
    const filtered = channels.filter(ch => {
      const searchText = `${ch.name} ${ch.genre} ${ch.lang} ${ch.url}`.toLowerCase();
      return searchText.includes(query);
    });
    
    return { total, filteredCount: filtered.length, channels: filtered };
  } catch (error) {
    console.error('Error finding channels:', error);
    return { total: 0, filteredCount: 0, channels: [], error: error.message };
  }
}

contextBridge.exposeInMainWorld('api', {
  /**
   * @returns {Promise<string>}
   */
  async getAppPath() {
    const appPath = await ipcRenderer.invoke('get-app-path');
    // Check if we're in production (app.asar)
    if (appPath.includes('app.asar')) {
      // Return the resources directory where the unpacked files are
      return dirname(dirname(appPath));
    }
    return appPath;
  },
  
  /**
   * Debug function to check file existence and paths
   */
  async debugPaths(fileName = 'live_streams.sii') {
    const appPath = await ipcRenderer.invoke('get-app-path');
    const paths = {
      appPath,
      isPackaged: appPath.includes('app.asar'),
      dirname: dirname(appPath),
      resourcesPath: dirname(dirname(appPath)),
      attempts: []
    };
    
    // Try different path combinations
    const pathsToTry = [
      join(appPath, fileName),
      join(dirname(appPath), fileName),
      join(dirname(dirname(appPath)), fileName),
    ];
    
    for (const p of pathsToTry) {
      try {
        await fs.access(p);
        paths.attempts.push({ path: p, exists: true });
      } catch {
        paths.attempts.push({ path: p, exists: false });
      }
    }
    
    return paths;
  },

  /**
   * @param {string} [filePath]
   * @param {string} [search]
   * @returns {Promise<{ total:number, filteredCount:number, channels:any[] }>}
   */
  async findGameChannels(filePath = 'live_streams.sii', search) {
    try {
      if (!isAbsolute(filePath)) {
        const appPath = await this.getAppPath();
        filePath = join(appPath, filePath);
      }
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (error) {
        console.error(`File not found at: ${filePath}`);
        // Try alternative paths if the file doesn't exist
        const debugInfo = await this.debugPaths();
        console.error('Debug info:', debugInfo);
        
        // Try to find the file in the first existing path
        const existingPath = debugInfo.attempts.find(a => a.exists);
        if (existingPath) {
          filePath = existingPath.path;
          console.log(`Using alternative path: ${filePath}`);
        } else {
          return { 
            total: 0, 
            filteredCount: 0, 
            channels: [], 
            error: `File not found. Tried: ${debugInfo.attempts.map(a => a.path).join(', ')}`
          };
        }
      }
      
      return findCurrentChannels(filePath, search);
    } catch (error) {
      console.error('Error in findGameChannels:', error);
      return { total: 0, filteredCount: 0, channels: [], error: error.message };
    }
  },

  /**
   * Let user pick a target directory and copy a live_streams.sii there.
   * @param {string} [sourcePath='live_streams.sii']
   * @param {string} [fileName='live_streams.sii']
   * @returns {Promise<{canceled:boolean, destPath?:string}>}
   */
  async exportLiveStreams(sourcePath = 'live_streams.sii', fileName = 'live_streams.sii') {
    try {
      if (!isAbsolute(sourcePath)) {
        const appPath = await this.getAppPath();
        sourcePath = join(appPath, sourcePath);
      }
      
      // Check if source exists
      try {
        await fs.access(sourcePath);
      } catch {
        const debugInfo = await this.debugPaths(fileName);
        const existingPath = debugInfo.attempts.find(a => a.exists);
        if (existingPath) {
          sourcePath = existingPath.path;
        } else {
          return { canceled: true, error: 'Source file not found' };
        }
      }
      
      const destDir = await ipcRenderer.invoke('select-export-dir');
      if (!destDir) return { canceled: true };
      
      const destPath = join(destDir, fileName);
      await fs.copyFile(sourcePath, destPath);
      return { canceled: false, destPath };
    } catch (error) {
      console.error('Export error:', error);
      return { canceled: true, error: error.message };
    }
  },

  /**
   * Export live_streams.sii with updated channel data (e.g., modified favorites)
   * @param {Array<{index:number, url:string, name:string, genre:string, lang:string, bitrate:string, favorite:string}>} channels
   * @param {string} [sourcePath='live_streams.sii']
   * @param {string} [fileName='live_streams.sii']
   * @returns {Promise<{canceled:boolean, destPath?:string}>}
   */
  async exportLiveStreamsWithData(channels, sourcePath = 'live_streams.sii', fileName = 'live_streams.sii') {
    try {
      if (!isAbsolute(sourcePath)) {
        const appPath = await this.getAppPath();
        sourcePath = join(appPath, sourcePath);
      }
      
      // Read the original file to preserve header/footer and non-stream_data lines
      let originalContent = '';
      try {
        originalContent = await fs.readFile(sourcePath, 'utf8');
      } catch {
        const debugInfo = await this.debugPaths(fileName);
        const existingPath = debugInfo.attempts.find(a => a.exists);
        if (existingPath) {
          sourcePath = existingPath.path;
          originalContent = await fs.readFile(sourcePath, 'utf8');
        } else {
          return { canceled: true, error: 'Source file not found' };
        }
      }

      // Parse the original content to preserve structure
      const lines = originalContent.split(/\r?\n/);
      const entryRegex = /^(\s*stream_data\[(\d+)\]:\s*")([^"]*)(".*)?$/;
      const updatedLines = [];
      
      // Create a map of channels by index for quick lookup
      const channelMap = new Map(channels.map(ch => [ch.index, ch]));
      
      for (const line of lines) {
        const match = line.match(entryRegex);
        if (match) {
          const prefix = match[1];
          const index = Number(match[2]);
          const suffix = match[4] || '"';
          
          const channel = channelMap.get(index);
          if (channel) {
            // Format the channel data with pipe delimiters
            const payload = `${channel.url}|${channel.name}|${channel.genre}|${channel.lang}|${channel.bitrate}|${channel.favorite}`;
            updatedLines.push(`${prefix}${payload}${suffix}`);
          } else {
            // Keep original line if no update for this index
            updatedLines.push(line);
          }
        } else {
          // Keep non-stream_data lines as-is
          updatedLines.push(line);
        }
      }
      
      const destDir = await ipcRenderer.invoke('select-export-dir');
      if (!destDir) return { canceled: true };
      
      const destPath = join(destDir, fileName);
      await fs.writeFile(destPath, updatedLines.join('\n'), 'utf8');
      return { canceled: false, destPath };
    } catch (error) {
      console.error('Export error:', error);
      return { canceled: true, error: error.message };
    }
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
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      console.error('Error reading file:', error);
      throw error;
    }
  },

  /** Copy from an explicit source path to target (default live_streams.sii) with backup rotation. */
  async importLiveStreamsFromPath(srcPath, targetPath = 'live_streams.sii') {
    try {
      const appPath = await this.getAppPath();
      const absDest = isAbsolute(targetPath) ? targetPath : join(appPath, targetPath);

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
            files.sort((a,b) => b.name.localeCompare(a.name));
            const toDelete = files.slice(10);
            await Promise.allSettled(toDelete.map(f => fs.unlink(f.path)));
          } catch {}
        }
      } catch {}

      // Replace destination with source
      await fs.copyFile(srcPath, absDest);
      console.log(`Imported from ${srcPath} to ${absDest}`);
      return { canceled: false, srcPath, destPath: absDest };
    } catch (error) {
      console.error('Import error:', error);
      return { canceled: true, error: error.message };
    }
  },
  
  // Stub for fetchPublicStations - can be implemented later if needed
  async fetchPublicStations(filters) {
    console.warn('fetchPublicStations not yet implemented in production build');
    return [];
  },
  
  /**
   * Save updated channel data to the original file (overwrite)
   * @param {Array<{index:number, url:string, name:string, genre:string, lang:string, bitrate:string, favorite:string}>} channels
   * @param {string} [targetPath='live_streams.sii']
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async saveLiveStreamsData(channels, targetPath = 'live_streams.sii') {
    try {
      if (!isAbsolute(targetPath)) {
        const appPath = await this.getAppPath();
        targetPath = join(appPath, targetPath);
      }
      
      // Read the original file
      let originalContent = '';
      try {
        originalContent = await fs.readFile(targetPath, 'utf8');
      } catch (error) {
        const debugInfo = await this.debugPaths(targetPath);
        const existingPath = debugInfo.attempts.find(a => a.exists);
        if (existingPath) {
          targetPath = existingPath.path;
          originalContent = await fs.readFile(targetPath, 'utf8');
        } else {
          return { success: false, error: 'File not found' };
        }
      }

      // Create backup before overwriting
      const backupsRoot = join(dirname(targetPath), 'backups', 'live_streams');
      await fs.mkdir(backupsRoot, { recursive: true });
      const ts = new Date();
      const pad = (n, w=2) => String(n).padStart(w, '0');
      const name = `live_streams_${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}-${pad(ts.getMilliseconds(),3)}.sii`;
      const backupPath = join(backupsRoot, name);
      await fs.copyFile(targetPath, backupPath);
      
      // Keep only 10 newest backups
      try {
        const entries = await fs.readdir(backupsRoot, { withFileTypes: true });
        const files = entries.filter(e => e.isFile() && e.name.endsWith('.sii'))
          .map(e => ({ name: e.name, path: join(backupsRoot, e.name) }));
        files.sort((a,b) => b.name.localeCompare(a.name));
        const toDelete = files.slice(10);
        await Promise.allSettled(toDelete.map(f => fs.unlink(f.path)));
      } catch {}

      // Parse and update the content
      const lines = originalContent.split(/\r?\n/);
      const entryRegex = /^(\s*stream_data\[(\d+)\]:\s*")([^"]*)(".*)?$/;
      const updatedLines = [];
      
      // Create a map of channels by index for quick lookup
      const channelMap = new Map(channels.map(ch => [ch.index, ch]));
      
      for (const line of lines) {
        const match = line.match(entryRegex);
        if (match) {
          const prefix = match[1];
          const index = Number(match[2]);
          const suffix = match[4] || '"';
          
          const channel = channelMap.get(index);
          if (channel) {
            // Format the channel data with pipe delimiters
            const payload = `${channel.url}|${channel.name}|${channel.genre}|${channel.lang}|${channel.bitrate}|${channel.favorite}`;
            updatedLines.push(`${prefix}${payload}${suffix}`);
          } else {
            // Keep original line if no update for this index
            updatedLines.push(line);
          }
        } else {
          // Keep non-stream_data lines as-is
          updatedLines.push(line);
        }
      }
      
      // Write back to the original file
      await fs.writeFile(targetPath, updatedLines.join('\n'), 'utf8');
      console.log(`Saved changes to ${targetPath}`);
      return { success: true };
    } catch (error) {
      console.error('Save error:', error);
      return { success: false, error: error.message };
    }
  },

  // Stub for markFavorite - can be implemented later if needed  
  async markFavorite(filePath, indexOrIndexes, setFavorite = true) {
    console.warn('markFavorite not yet implemented in production build');
    return;
  }
});