// Preload runs in an isolated, privileged context. Keep the surface minimal.
const { contextBridge } = require('electron');
const { resolve } = require('node:path');
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
  }
});
