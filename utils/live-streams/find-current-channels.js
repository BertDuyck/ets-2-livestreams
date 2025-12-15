#!/usr/bin/env node
// Read ETS2/ATS live_streams.sii and return channels in JSON form.
// Output shape: { total: number, filteredCount: number, channels: Array<{index,url,name,genre,lang,bitrate,favorite}> }

import { readFileSync } from 'node:fs';

/**
 * @typedef {Object} Channel
 * @property {number} index
 * @property {string} url
 * @property {string} name
 * @property {string} genre
 * @property {string} lang
 * @property {string} bitrate
 * @property {string} favorite
 */

/**
 * @typedef {Object} SearchOptions
 * @property {string} [query] - Search text or regex source (depending on mode).
 * @property {('substring'|'startswith'|'regex'|'fuzzy')} [mode='substring'] - Match mode.
 * @property {string[]} [fields=['name','url','genre','lang']] - Fields to search.
 * @property {number} [distance=1] - Max Levenshtein distance (only for fuzzy mode).
 * @property {boolean} [caseInsensitive=true] - Case-insensitive matching.
 * @property {boolean} [ignoreDiacritics=true] - Strip accents/diacritics before matching.
 */

const DEFAULT_FIELDS = ['name','url','genre','lang'];

function normalizeString(s, { caseInsensitive = true, ignoreDiacritics = true } = {}) {
  let out = String(s ?? '');
  if (ignoreDiacritics) out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (caseInsensitive) out = out.toLowerCase();
  return out;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(
        dp[j] + 1,      // deletion
        dp[j - 1] + 1,  // insertion
        prev + cost     // substitution
      );
      prev = tmp;
    }
  }
  return dp[n];
}

function fuzzyIncludes(text, query, maxDist) {
  if (query.length === 0) return true;
  if (text.length === 0) return false;
  const L = query.length;
  let best = Infinity;
  for (let i = 0; i <= text.length - L; i++) {
    const slice = text.slice(i, i + L);
    const d = levenshtein(slice, query);
    if (d < best) best = d;
    if (best <= maxDist) return true;
  }
  // Also consider entire string in case query longer
  if (text.length < L) {
    if (levenshtein(text, query) <= maxDist) return true;
  }
  return false;
}

function buildMatcher(opts) {
  const {
    query = '', mode = 'substring', fields = DEFAULT_FIELDS,
    caseInsensitive = true, ignoreDiacritics = true, distance = 1,
  } = opts || {};

  const norm = s => normalizeString(s, { caseInsensitive, ignoreDiacritics });
  const qNorm = norm(query);
  let regex;
  if (mode === 'regex') {
    try { regex = new RegExp(query, caseInsensitive ? 'i' : undefined); } catch (_) { regex = null; }
  }

  return (ch) => {
    for (const f of fields) {
      const raw = ch[f] ?? '';
      const t = norm(raw);
      switch (mode) {
        case 'startswith':
          if (t.startsWith(qNorm)) return true;
          break;
        case 'regex':
          // apply regex to normalized text to keep diacritics-insensitive behavior
          if (regex && regex.test(t)) return true;
          break;
        case 'fuzzy':
          if (fuzzyIncludes(t, qNorm, distance)) return true;
          break;
        case 'substring':
        default:
          if (t.includes(qNorm)) return true;
      }
    }
    return false;
  };
}

/**
 * Parse the live_streams.sii file into Channel objects.
 * @param {string} filePath
 * @returns {Channel[]}
 */
function parseChannels(filePath = 'live_streams.sii') {
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
}

/**
 * Find current channels with optional flexible search.
 * Backwards compatible: if second arg is a string, it's treated as substring query on name only.
 *
 * @param {string} [filePath='live_streams.sii']
 * @param {string|SearchOptions} [search]
 * @returns {{ total:number, filteredCount:number, channels: Channel[] }}
 */
export function findCurrentChannels(filePath = 'live_streams.sii', search) {
  const channels = parseChannels(filePath);
  const total = channels.length;

  if (!search || (typeof search === 'string' && search.trim() === '')) {
    return { total, filteredCount: total, channels };
  }

  // Back-compat string -> simple opts
  /** @type {SearchOptions} */
  const opts = typeof search === 'string'
    ? { query: search, mode: 'substring', fields: ['name'], caseInsensitive: true, ignoreDiacritics: true }
    : search;

  const matcher = buildMatcher(opts);
  const filtered = channels.filter(matcher);
  return { total, filteredCount: filtered.length, channels: filtered };
}

// Optional: allow running as a script to print JSON to stdout
if (process.argv[1] && import.meta.url && decodeURI(new URL(import.meta.url).pathname).endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const showHelp = process.argv.includes('-h') || process.argv.includes('--help');
  if (showHelp) {
    const help = `\nUsage: node utils/live-streams/find-current-channels.js [live_streams.sii] [--search=QUERY] [--mode=substring|startswith|regex|fuzzy] [--fields=name,url,genre,lang] [--distance=N]\n\nExamples:\n  node utils/live-streams/find-current-channels.js\n  node utils/live-streams/find-current-channels.js --search=willy\n  node utils/live-streams/find-current-channels.js --search=wiloy --mode=fuzzy --distance=1\n  node utils/live-streams/find-current-channels.js --search=^willy --mode=regex\n  node utils/live-streams/find-current-channels.js --search=rock --fields=genre\n`;
    console.log(help);
    process.exit(0);
  }

  const fileArg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'live_streams.sii';
  const getFlag = (name) => {
    const p = `--${name}=`;
    const hit = process.argv.find(a => a.startsWith(p));
    return hit ? hit.slice(p.length) : undefined;
  };
  const search = getFlag('search');
  const mode = getFlag('mode');
  const fields = (getFlag('fields') || '').split(',').filter(Boolean);
  const distance = Number(getFlag('distance'));

  /** @type {import('./find-current-channels.js').SearchOptions} */
  const options = {
    query: search,
    mode: mode || 'substring',
    fields: fields.length ? fields : undefined,
    distance: Number.isFinite(distance) ? distance : undefined,
    caseInsensitive: true,
    ignoreDiacritics: true,
  };

  const res = findCurrentChannels(fileArg, options);
  console.log(JSON.stringify(res, null, 2));
}
