// Utilities to read/modify ETS2/ATS live_streams.sii
// Node >= 16, ESM.
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * A radio station entry as represented in live_streams.sii.
 * All fields are serialized as pipe-delimited strings: url|name|genre|lang|bitrate|favorite
 *
 * @typedef {Object} Station
 * @property {string} url - Stream URL.
 * @property {string} name - Display name.
 * @property {string} genre - Genre label.
 * @property {string} [lang="EN"] - Language code (e.g., NL/EN/FR).
 * @property {string} [bitrate=""] - Bitrate number as string (e.g., "128") or empty.
 * @property {string} [favorite="0"] - "1" to mark favorite, otherwise "0".
 */

/**
 * Insert a station at a specific 0-based index. If the index already exists,
 * the existing entry at that index and all following entries are shifted up by 1.
 * The global stream_data count is incremented accordingly.
 *
 * Behavior:
 * - insertIdx < 0 -> clamped to 0 (insert at beginning)
 * - insertIdx > current length -> appended at end
 *
 * @param {string} filePath - Path to live_streams.sii to modify.
 * @param {Station} station - Station to insert.
 * @param {number} insertIdx - 0-based index at which to insert.
 * @throws {Error} If the file format is not recognized.
 * @returns {void}
 *
 * @example
 * import { insertAtIndex } from './utils/live-streams/insert-at-index.js';
 * insertAtIndex('live_streams.sii', { url, name, genre, lang: 'NL', bitrate: '', favorite: '0' }, 8);
 */
export function insertAtIndex(filePath, station, insertIdx) {
  if (insertIdx == null || Number.isNaN(Number(insertIdx))) {
    throw new Error('insertIdx must be a number');
  }
  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);

  // Locate total count line
  const countLineIdx = lines.findIndex(l => /^\s*stream_data:\s*\d+/.test(l));
  if (countLineIdx === -1) throw new Error('stream_data count line not found');
  const currentCount = Number(lines[countLineIdx].match(/\d+/)[0]);

  // Collect all stream_data entries with their indices and payloads
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

  // Sort entries by numeric index
  const parsed = entries.sort((a, b) => a.idx - b.idx);

  // Normalize insertIdx bounds (allow append)
  const maxIdx = parsed.length; // inserting at length appends
  const target = Math.max(0, Math.min(Number(insertIdx), maxIdx));

  // Build payload to insert
  const newPayload = [
    station.url,
    station.name,
    station.genre,
    station.lang ?? 'EN',
    station.bitrate ?? '',
    station.favorite ?? '0',
  ].join('|');

  // Rebuild entries with insertion and reindexing
  const rebuilt = [];
  for (let i = 0; i < parsed.length + 1; i++) {
    if (i < target) {
      rebuilt.push({ idx: i, payload: parsed[i].payload });
    } else if (i === target) {
      rebuilt.push({ idx: i, payload: newPayload });
    } else {
      // shift existing by +1
      rebuilt.push({ idx: i, payload: parsed[i - 1].payload });
    }
  }

  // Update total count line
  const newCount = currentCount + 1;
  lines[countLineIdx] = lines[countLineIdx].replace(/(stream_data:\s*)\d+/, `$1${newCount}`);

  // Replace the block of stream_data lines in-place
  lines.splice(firstEntryIdx, entries.length, ...rebuilt.map(e => ` stream_data[${e.idx}]: \"${e.payload}\"`));

  writeFileSync(filePath, lines.join('\n'), 'utf8');
}
