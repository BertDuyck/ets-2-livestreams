#!/usr/bin/env node
// Mark channel(s) at given index(es) as favorite (favorite = '1') in live_streams.sii
// Node >=16, ESM
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * @typedef {Object} Station
 * @property {string} url
 * @property {string} name
 * @property {string} genre
 * @property {string} lang
 * @property {string} bitrate
 * @property {string} favorite
 */

/**
 * Mark or unmark one or more channels as favorite by index.
 *
 * @param {string} filePath - Path to live_streams.sii.
 * @param {number|number[]} indexOrIndexes - 0-based channel index or array of indices in stream_data[].
 * @param {boolean} [setFavorite=true] - true => set to '1', false => set to '0'.
 */
export function markFavorite(filePath = 'live_streams.sii', indexOrIndexes, setFavorite = true) {
  const indices = Array.isArray(indexOrIndexes) ? indexOrIndexes : [indexOrIndexes];
  const parsed = indices.map(n => Number(n));
  if (parsed.some(n => n == null || Number.isNaN(n))) {
    throw new Error('index must be a number or an array of numbers');
  }
  const toSet = Array.from(new Set(parsed)).sort((a,b) => a - b);

  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);

  const entryRegex = /^\s*stream_data\[(\d+)\]:\s*\"([^\"]*)\"/;
  const entries = [];
  let firstEntryIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(entryRegex);
    if (m) {
      if (firstEntryIdx === -1) firstEntryIdx = i;
      const idx = Number(m[1]);
      const payload = m[2];
      entries.push({ lineIdx: i, idx, payload });
    }
  }
  if (entries.length === 0) throw new Error('No stream_data entries found');

  // Sort and validate range
  const sorted = entries.sort((a, b) => a.idx - b.idx);
  const maxIdx = sorted.length - 1;
  const outOfRange = toSet.filter(i => i < 0 || i > maxIdx);
  if (outOfRange.length) {
    throw new Error(`index out of range: ${outOfRange.join(', ')} (valid 0..${maxIdx})`);
  }

  const markSet = new Set(toSet);

  // Rebuild payloads with same indices; update favorites for requested indices
  const rebuilt = sorted.map((e, i) => {
    if (!markSet.has(i)) return { idx: i, payload: e.payload };
    const fields = e.payload.split('|');
    while (fields.length < 6) fields.push('');
    fields[5] = setFavorite ? '1' : '0';
    return { idx: i, payload: fields.join('|') };
  });

  // Replace the block of stream_data lines in-place
  lines.splice(firstEntryIdx, entries.length, ...rebuilt.map(e => ` stream_data[${e.idx}]: \"${e.payload}\"`));

  writeFileSync(filePath, lines.join('\n'), 'utf8');
}

// CLI
if (process.argv[1] && import.meta.url && decodeURI(new URL(import.meta.url).pathname).endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const showHelp = process.argv.includes('-h') || process.argv.includes('--help');
  const help = `\nUsage: node utils/live-streams/mark-favorite.js [live_streams.sii] (--index=N | --index=N,M,K | --index=N --index=M ...) [--unset]\n\nOptions:\n  --index=N      0-based index to (un)mark as favorite. Can repeat or comma-separate.\n  --unset        Unmark (set favorite to '0').\n\nExamples:\n  node utils/live-streams/mark-favorite.js --index=9\n  node utils/live-streams/mark-favorite.js --index=7,8,9\n  node utils/live-streams/mark-favorite.js --index=7 --index=8 --index=9 --unset\n`;
  if (showHelp) {
    console.log(help);
    process.exit(0);
  }

  const fileArg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'live_streams.sii';
  const getFlags = (name) => process.argv.filter(a => a.startsWith(`--${name}=`)).map(a => a.split('=')[1]);
  const idxFlags = getFlags('index');
  const unset = process.argv.includes('--unset');

  if (idxFlags.length === 0) {
    console.error('Error: at least one --index=N is required');
    console.log(help);
    process.exit(2);
  }

  const idxList = idxFlags.flatMap(s => s.split(',')).filter(Boolean).map(Number);

  try {
    markFavorite(fileArg, idxList, !unset);
    console.log(`Updated favorite at index(es) ${idxList.join(', ')} => ${unset ? '0' : '1'}`);
  } catch (e) {
    console.error(String(e && e.message || e));
    process.exit(1);
  }
}
