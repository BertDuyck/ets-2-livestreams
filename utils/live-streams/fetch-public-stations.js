// Query Radio Browser (public, no auth) and return normalized station objects.
// Node: ESM. No external deps; uses https.
// Docs: https://www.radio-browser.info/

import https from 'node:https';
import { URL } from 'node:url';

/**
 * A radio station entry compatible with your live_streams.sii shape.
 * Extra metadata (favicon, homepage, country) is included for convenience.
 *
 * @typedef {Object} PublicStation
 * @property {string} url - Stream URL (resolved); suitable for live_streams.sii `url`.
 * @property {string} name - Station display name.
 * @property {string} genre - Comma-separated tags.
 * @property {string} [lang="EN"] - Language code if known.
 * @property {string} [bitrate=""] - Bitrate as string (e.g. "128").
 * @property {"0"|"1"} [favorite="0"] - Default not favorite.
 * @property {string} [favicon] - Station favicon URL.
 * @property {string} [homepage] - Station homepage URL.
 * @property {string} [country] - Country name.
 */

/**
 * @typedef {Object} FetchFilters
 * @property {string} [name] - Partial station name match.
 * @property {string} [tag] - Genre/tag filter (e.g., "jazz").
 * @property {string} [country] - Country name (e.g., "United States").
 * @property {string} [language] - ISO language name (e.g., "English").
 * @property {number} [limit=50] - Max stations to return.
 * @property {boolean} [hidebroken=true] - Exclude dead streams.
 * @property {number} [timeoutMs=5000] - Request timeout per HTTP call.
 */

const DEFAULT_UA = 'ets-radio-editor/0.1 (+no-reply@example)';
const SERVERS_INDEX = 'https://api.radio-browser.info/json/servers';
const FALLBACK_BASES = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];

/**
 * Minimal HTTPS GET returning parsed JSON.
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
function getJSON(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get({
      protocol: u.protocol,
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'User-Agent': DEFAULT_UA, 'Accept': 'application/json' },
    }, (res) => {
      const { statusCode } = res;
      if (!statusCode || statusCode < 200 || statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Invalid JSON from ${url}: ${String(e && e.message || e)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout after ${timeoutMs}ms for ${url}`));
    });
  });
}

/**
 * Pick a Radio Browser base URL (https) by querying the directory; falls back to known mirrors.
 * @param {number} timeoutMs
 * @returns {Promise<string>}
 */
async function chooseBaseUrl(timeoutMs) {
  try {
    const servers = await getJSON(SERVERS_INDEX, timeoutMs);
    const httpsUrls = Array.isArray(servers)
      ? servers.map(s => s && (s.url || s.server || s.name)).filter(Boolean).filter(u => String(u).startsWith('https://'))
      : [];
    if (httpsUrls.length > 0) return httpsUrls[Math.floor(Math.random() * httpsUrls.length)].replace(/\/$/, '');
  } catch (_) { /* ignore and use fallback */ }
  return FALLBACK_BASES[Math.floor(Math.random() * FALLBACK_BASES.length)];
}

/**
 * Normalize a Radio Browser station object to PublicStation.
 * @param {any} s
 * @returns {PublicStation}
 */
function normalizeRBStation(s) {
  const tags = (s.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const bitrate = (s.bitrate != null && s.bitrate !== '') ? String(s.bitrate) : '';
  // Prefer resolved HTTPS stream URL if available
  const url = s.url_resolved || s.url || '';
  return {
    url,
    name: s.name || '',
    genre: tags.join(', '),
    lang: s.language || 'EN',
    bitrate,
    favorite: '0',
    favicon: s.favicon || undefined,
    homepage: s.homepage || undefined,
    country: s.country || undefined,
  };
}

/**
 * Fetch public internet radio stations via Radio Browser (no auth required).
 * Returns a normalized list compatible with live_streams.sii fields.
 *
 * @param {FetchFilters} [filters]
 * @returns {Promise<PublicStation[]>}
 */
export async function fetchPublicStations(filters = {}) {
  const {
    name,
    tag,
    country,
    language,
    limit = 50,
    hidebroken = true,
    timeoutMs = 5000,
  } = filters;

  const base = await chooseBaseUrl(timeoutMs);
  const q = new URL(base + '/json/stations/search');
  if (name) q.searchParams.set('name', name);
  if (tag) q.searchParams.set('tag', tag);
  if (country) q.searchParams.set('country', country);
  if (language) q.searchParams.set('language', language);
  if (hidebroken) q.searchParams.set('hidebroken', 'true');
  if (limit) q.searchParams.set('limit', String(limit));
  // Sort by votes desc to get popular, active stations first
  q.searchParams.set('order', 'votes');
  q.searchParams.set('reverse', 'true');

  const raw = await getJSON(q.toString(), timeoutMs);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeRBStation).filter(s => s.url);
}

// Optional: allow executing as a script for quick testing
if (process.argv[1] && import.meta.url && decodeURI(new URL(import.meta.url).pathname).endsWith(process.argv[1].replace(/\\/g, '/'))) {
  (async () => {
    const getFlag = (name) => {
      const p = `--${name}=`; const hit = process.argv.find(a => a.startsWith(p));
      return hit ? hit.slice(p.length) : undefined;
    };
    const filters = {
      name: getFlag('name'),
      tag: getFlag('tag'),
      country: getFlag('country'),
      language: getFlag('language'),
      limit: Number(getFlag('limit')) || 25,
      hidebroken: (getFlag('hidebroken') ?? 'true') !== 'false',
      timeoutMs: Number(getFlag('timeoutMs')) || 5000,
    };
    try {
      const stations = await fetchPublicStations(filters);
      console.log(JSON.stringify({ count: stations.length, stations }, null, 2));
    } catch (e) {
      console.error(String(e && e.message || e));
      process.exit(1);
    }
  })();
}
