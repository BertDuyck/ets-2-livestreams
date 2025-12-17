// Preload runs in an isolated, privileged context. Keep the surface minimal.
const { contextBridge, ipcRenderer } = require("electron");
const { resolve, join, isAbsolute, dirname } = require("node:path");
const { readFileSync } = require("node:fs");
const fs = require("node:fs/promises");

// Embed the channel parsing logic directly to avoid dynamic import issues in production
function parseChannels(filePath) {
  try {
    const raw = readFileSync(filePath, "utf8");
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
      .map((e) => {
        const fields = e.payload.split("|");
        const [
          url = "",
          name = "",
          genre = "",
          lang = "EN",
          bitrate = "",
          favorite = "0",
        ] = fields;
        return { index: e.idx, url, name, genre, lang, bitrate, favorite };
      });
  } catch (error) {
    console.error("Error parsing channels:", error);
    throw error;
  }
}

function findCurrentChannels(filePath, search) {
  const channels = parseChannels(filePath);
  const total = channels.length;

  if (!search || (typeof search === "string" && search.trim() === "")) {
    return { total, filteredCount: total, channels };
  }

  // Simple substring search for now
  const query = String(search).toLowerCase();
  const filtered = channels.filter((ch) => {
    const searchText =
      `${ch.name} ${ch.genre} ${ch.lang} ${ch.url}`.toLowerCase();
    return searchText.includes(query);
  });

  return { total, filteredCount: filtered.length, channels: filtered };
}

contextBridge.exposeInMainWorld("api", {
  /**
   * @returns {Promise<string>}
   */
  async getAppPath() {
    const appPath = await ipcRenderer.invoke("get-app-path");
    // // Check if we're in production (app.asar)
    if (appPath.includes("app.asar")) {
      // Return the resources directory where the unpacked files are
      return dirname(dirname(appPath));
    }
    return appPath;
  },

  /**
   * Debug function to check file existence and paths
   */
  async debugPaths(fileName = "live_streams.sii") {
    const appPath = await ipcRenderer.invoke("get-app-path");
    const paths = {
      appPath,
      isPackaged: appPath.includes("app.asar"),
      dirname: dirname(appPath),
      resourcesPath: dirname(dirname(appPath)),
      attempts: [],
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
  async findGameChannels(filePath = "live_streams.sii", search) {
    try {
      if (!isAbsolute(filePath)) {
        const appPath = await this.getAppPath();
        filePath = join(appPath, filePath);
      }

      console.log(`Finding channels in: ${filePath}`);

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (error) {
        console.error(`File not found at: ${filePath}`);
        // Try alternative paths if the file doesn't exist
        const debugInfo = await this.debugPaths();
        console.error("Debug info:", debugInfo);

        // Try to find the file in the first existing path
        const existingPath = debugInfo.attempts.find((a) => a.exists);
        if (existingPath) {
          filePath = existingPath.path;
          console.log(`Using alternative path: ${filePath}`);
        } else {
          throw error;
        }
      }

      return findCurrentChannels(filePath, search);
    } catch (error) {
      console.error("Error in findGameChannels:", error);
      return { total: 0, filteredCount: 0, channels: [], error: error.message };
    }
  },

  /**
   * Let user pick a target directory and copy a live_streams.sii there.
   * @param {string} [sourcePath='live_streams.sii']
   * @param {string} [fileName='live_streams.sii']
   * @returns {Promise<{canceled:boolean, destPath?:string}>}
   */
  async exportLiveStreams(
    sourcePath = "live_streams.sii",
    fileName = "live_streams.sii"
  ) {
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
        const existingPath = debugInfo.attempts.find((a) => a.exists);
        if (existingPath) {
          sourcePath = existingPath.path;
        } else {
          return { canceled: true, error: "Source file not found" };
        }
      }

      const destDir = await ipcRenderer.invoke("select-export-dir");
      if (!destDir) return { canceled: true };

      const destPath = join(destDir, fileName);
      await fs.copyFile(sourcePath, destPath);
      return { canceled: false, destPath };
    } catch (error) {
      console.error("Export error:", error);
      return { canceled: true, error: error.message };
    }
  },

  async exportLiveStreamsWithDataToEuroTruckSimulator(channels) {
    const euroTruckSimulatorPath = await ipcRenderer.invoke("get-ets2-path");

    return this.exportLiveStreamsWithData(
      channels,
      "live_streams.sii",
      join(euroTruckSimulatorPath, "live_streams.sii")
    );
  },

  async exportLiveStreamsWithDataToAppData(channels) {
    const appPath = await this.getAppPath();

    return this.exportLiveStreamsWithData(
      channels,
      "live_streams.sii",
      join(appPath, "live_streams.sii")
    );
  },

  /**
   * Export live_streams.sii with updated channel data (e.g., modified favorites)
   * @param {Array<{index:number, url:string, name:string, genre:string, lang:string, bitrate:string, favorite:string}>} channels
   * @param {string} [sourcePath='live_streams.sii']
   * @param {string} [destinationPath='live_streams.sii']
   * @returns {Promise<{canceled:boolean, destPath?:string}>}
   */
  async exportLiveStreamsWithData(
    channels,
    sourcePath = "live_streams.sii",
    destinationPath = "live_streams.sii"
  ) {
    try {
      if (!isAbsolute(sourcePath)) {
        const appPath = await this.getAppPath();
        sourcePath = join(appPath, sourcePath);
      }

      // Read the original file to preserve header/footer and non-stream_data lines
      let originalContent = "";
      try {
        originalContent = await fs.readFile(sourcePath, "utf8");
      } catch {
        const debugInfo = await this.debugPaths(destinationPath);
        const existingPath = debugInfo.attempts.find((a) => a.exists);
        if (existingPath) {
          sourcePath = existingPath.path;
          originalContent = await fs.readFile(sourcePath, "utf8");
        } else {
          return { canceled: true, error: "Source file not found" };
        }
      }

      // Parse the original content to preserve structure
      const lines = originalContent.split(/\r?\n/);
      const entryRegex = /^(\s*stream_data\[(\d+)\]:\s*")([^"]*)(".*)?$/;
      const channelCountRegex = /^\s*stream_data\s*:\s*(\d+)\s*$/;
      const updatedLines = [];

      // Create a map of channels by index for quick lookup
      const channelMap = new Map(channels.map((ch) => [ch.index, ch]));
      let matched = false;

      for (const line of lines) {
        const match = line.match(entryRegex);
        if (match && !matched) {
          matched = true;
          for (const channel of channels) {
            const prefix = `stream_data[${channel.index}]: "`;
            const suffix = '"';
            const payload = `${channel.url}|${channel.name}|${channel.genre}|${channel.lang}|${channel.bitrate}|${channel.favorite}`;
            updatedLines.push(`${prefix}${payload}${suffix}`);
          }

          // const prefix = match[1];
          // const index = Number(match[2]);
          // const suffix = match[4] || '"';

          // const channel = channelMap.get(index);
          // if (channel) {
          //   // Format the channel data with pipe delimiters
          //   const payload = `${channel.url}|${channel.name}|${channel.genre}|${channel.lang}|${channel.bitrate}|${channel.favorite}`;
          //   updatedLines.push(`${prefix}${payload}${suffix}`);
          // } else {
          //   // Keep original line if no update for this index
          //   updatedLines.push(line);
          // }
        }
        if (!match) {
          if (line.match(channelCountRegex)) {
            updatedLines.push(`stream_data: ${channels.length}`);
          } else {
            // Keep non-stream_data lines as-is
            updatedLines.push(line);
          }
        }
      }

      let destPath = "";

      if (!isAbsolute(destinationPath)) {
        const destDir = await ipcRenderer.invoke("select-export-dir");
        if (!destDir) return { canceled: true };

        destPath = join(destDir, destinationPath);
        console.log(
          `Exporting to: ${destPath} ${JSON.stringify(lines)}`,
          updatedLines.length,
          updatedLines
        );
      } else {
        destPath = destinationPath;
        console.log(
          `Exporting to: ${destPath}`,
          updatedLines.join("\n"),
          channels
        );
        console.log(`Length`, updatedLines.length, channels.length);
      }

      await fs.writeFile(destPath, updatedLines.join("\n"), "utf8");

      return { canceled: false, destPath };
    } catch (error) {
      console.error("Export error:", error);
      return { canceled: true, error: error.message };
    }
  },

  async importLiveStreamsFromEuroTruckSimulator(
    targetPath = "live_streams.sii"
  ) {
    console.log('importLiveStreamsFromEuroTruckSimulator', targetPath);
    const euroTruckSimulatorPath = await ipcRenderer.invoke("get-ets2-path");
    console.log('importLiveStreamsFromEuroTruckSimulator euroTruckSimulatorPath', targetPath, join(euroTruckSimulatorPath, "live_streams.sii"));

    return this.importLiveStreamsFromPath(
      join(euroTruckSimulatorPath, "live_streams.sii"),
      targetPath
    );
  },

  /**
   * Pick a file and replace the target live_streams.sii on disk.
   * @param {string} [targetPath='live_streams.sii']
   * @returns {Promise<{canceled:boolean, srcPath?:string, destPath?:string}>}
   */
  async importLiveStreams(targetPath = "live_streams.sii") {
    const srcPath = await ipcRenderer.invoke("select-import-file");
    if (!srcPath) return { canceled: true };
    return this.importLiveStreamsFromPath(srcPath, targetPath);
  },

  /** Pick a file path for import (no reading/copying). */
  async chooseImportFile() {
    return ipcRenderer.invoke("select-import-file");
  },

  showAlert(message) {
    ipcRenderer.send("show-alert", message);
  },

  refocusMainWindow() {
    ipcRenderer.send("refocus-main-window");
  },

  /** Read a text file (utf8). */
  async readTextFile(filePath) {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch (error) {
      console.error("Error reading file:", error);
      throw error;
    }
  },

  /** Copy from an explicit source path to target (default live_streams.sii) with backup rotation. */
  async importLiveStreamsFromPath(srcPath, targetPath = "live_streams.sii") {
    console.log('importLiveStreamsFromPath', srcPath, targetPath);
    const channels = findCurrentChannels(srcPath);
    if (!~channels?.length) {
      throw new Error('Invalid file');
    }
    const appPath = await this.getAppPath();
    const appFilePath = join(appPath, 'live_streams.sii');
    const stat = await fs.stat(appFilePath).catch(() => null);
    console.log('FILE STAT', stat);
    if (!stat || !stat.isFile()) {
      // await fs.writeFile(targetPath, updatedLines.join("\n"), "utf8");
      await fs.copyFile(srcPath, appFilePath);
    }

    return channels;
    // try {
    //   const appPath = await this.getAppPath();
    //   const absDest = isAbsolute(targetPath)
    //     ? targetPath
    //     : join(appPath, targetPath);

    //   // Create backup if destination exists
    //   try {
    //     const stat = await fs.stat(absDest).catch(() => null);
    //     if (stat && stat.isFile()) {
    //       const backupsRoot = join(dirname(absDest), "backups", "live_streams");
    //       await fs.mkdir(backupsRoot, { recursive: true });
    //       const ts = new Date();
    //       const pad = (n, w = 2) => String(n).padStart(w, "0");
    //       const name = `live_streams_${ts.getFullYear()}${pad(
    //         ts.getMonth() + 1
    //       )}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(
    //         ts.getMinutes()
    //       )}${pad(ts.getSeconds())}-${pad(ts.getMilliseconds(), 3)}.sii`;
    //       const backupPath = join(backupsRoot, name);
    //       await fs.copyFile(absDest, backupPath);
    //       // Rotation: keep 10 newest
    //       try {
    //         const entries = await fs.readdir(backupsRoot, {
    //           withFileTypes: true,
    //         });
    //         const files = entries
    //           .filter((e) => e.isFile() && e.name.endsWith(".sii"))
    //           .map((e) => ({ name: e.name, path: join(backupsRoot, e.name) }));
    //         files.sort((a, b) => b.name.localeCompare(a.name));
    //         const toDelete = files.slice(10);
    //         await Promise.allSettled(toDelete.map((f) => fs.unlink(f.path)));
    //       } catch {}
    //     }
    //   } catch {}

    //   // Replace destination with source
    //   await fs.copyFile(srcPath, absDest);
    //   console.log(`Imported from ${srcPath} to ${absDest}`);
    //   return { canceled: false, srcPath, destPath: absDest };
    // } catch (error) {
    //   console.error("Import error:", error);
    //   return { canceled: true, error: error.message };
    // }
  },

  // Stub for fetchPublicStations - can be implemented later if needed
  async fetchPublicStations(filters) {
    console.warn("fetchPublicStations not yet implemented in production build");
    return [];
  },

  /**
   * Save updated channel data to the original file (overwrite)
   * @param {Array<{index:number, url:string, name:string, genre:string, lang:string, bitrate:string, favorite:string}>} channels
   * @param {string} [targetPath='live_streams.sii']
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async saveLiveStreamsData(channels, targetPath = "live_streams.sii") {
    try {
      if (!isAbsolute(targetPath)) {
        const appPath = await this.getAppPath();
        targetPath = join(appPath, targetPath);
      }

      // Read the original file
      let originalContent = "";
      try {
        originalContent = await fs.readFile(targetPath, "utf8");
      } catch (error) {
        const debugInfo = await this.debugPaths(targetPath);
        const existingPath = debugInfo.attempts.find((a) => a.exists);
        if (existingPath) {
          targetPath = existingPath.path;
          originalContent = await fs.readFile(targetPath, "utf8");
        } else {
          return { success: false, error: "File not found" };
        }
      }

      // Create backup before overwriting
      const backupsRoot = join(dirname(targetPath), "backups", "live_streams");
      await fs.mkdir(backupsRoot, { recursive: true });
      const ts = new Date();
      const pad = (n, w = 2) => String(n).padStart(w, "0");
      const name = `live_streams_${ts.getFullYear()}${pad(
        ts.getMonth() + 1
      )}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(
        ts.getSeconds()
      )}-${pad(ts.getMilliseconds(), 3)}.sii`;
      const backupPath = join(backupsRoot, name);
      await fs.copyFile(targetPath, backupPath);

      // Keep only 10 newest backups
      try {
        const entries = await fs.readdir(backupsRoot, { withFileTypes: true });
        const files = entries
          .filter((e) => e.isFile() && e.name.endsWith(".sii"))
          .map((e) => ({ name: e.name, path: join(backupsRoot, e.name) }));
        files.sort((a, b) => b.name.localeCompare(a.name));
        const toDelete = files.slice(10);
        await Promise.allSettled(toDelete.map((f) => fs.unlink(f.path)));
      } catch { }

      // Parse the content to preserve non-stream_data lines and structure
      const lines = originalContent.split(/\r?\n/);
      const entryRegex = /^(\s*stream_data\[(\d+)\]:\s*")([^"]*)(".*)?$/;
      const updatedLines = [];

      // Sort channels by their current index to maintain order
      const sortedChannels = [...channels].sort((a, b) => a.index - b.index);

      // Normalize indices to be sequential starting from 0
      const normalizedChannels = sortedChannels.map((ch, idx) => ({
        ...ch,
        index: idx,
      }));

      let nextIndexToWrite = 0;
      const totalChannels = normalizedChannels.length;

      for (const line of lines) {
        const match = line.match(entryRegex);
        if (match) {
          // This is a stream_data line
          const originalIndex = Number(match[2]);
          const originalPrefix = match[1];
          const suffix = match[4] || '"';

          // Check if we have channels to write at this position
          if (nextIndexToWrite < totalChannels) {
            const channel = normalizedChannels[nextIndexToWrite];
            // Write the channel with sequential index
            const prefix = originalPrefix.replace(
              /\[\d+\]/,
              `[${nextIndexToWrite}]`
            );
            const payload = `${channel.url}|${channel.name}|${channel.genre}|${channel.lang}|${channel.bitrate}|${channel.favorite}`;
            updatedLines.push(`${prefix}${payload}${suffix}`);
            nextIndexToWrite++;
          }
          // If originalIndex is beyond our channel count, skip this line (deletion case)
        } else {
          // Keep non-stream_data lines as-is
          updatedLines.push(line);
        }
      }

      // Add any remaining channels that weren't written yet (addition case)
      // This happens when we have more channels than original file had stream_data lines
      for (let i = nextIndexToWrite; i < totalChannels; i++) {
        const channel = normalizedChannels[i];
        const payload = `${channel.url}|${channel.name}|${channel.genre}|${channel.lang}|${channel.bitrate}|${channel.favorite}`;
        // Use the same indentation as other stream_data lines
        updatedLines.push(` stream_data[${i}]: "${payload}"`);
      }

      // Write back to the original file
      await fs.writeFile(targetPath, updatedLines.join("\n"), "utf8");
      console.log(`Saved changes to ${targetPath}`);
      return { success: true };
    } catch (error) {
      console.error("Save error:", error);
      return { success: false, error: error.message };
    }
  },

  // Stub for markFavorite - can be implemented later if needed
  async markFavorite(filePath, indexOrIndexes, setFavorite = true) {
    console.warn("markFavorite not yet implemented in production build");
    return;
  },
});
