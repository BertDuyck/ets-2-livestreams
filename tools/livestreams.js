// Minimal utilities to read/modify ETS2 live_streams.sii
// Inserts a station after a given station name, updates indices and total count.
// Node >=16, ESM.
import { readFileSync, writeFileSync } from 'node:fs';

export function insertAfterName(filePath, station, afterName) {
  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);

  // Locate and update total count
  let countLineIdx = lines.findIndex(l => /^\s*stream_data:\s*\d+/.test(l));
  if (countLineIdx === -1) throw new Error('stream_data count line not found');
  const currentCount = Number(lines[countLineIdx].match(/\d+/)[0]);
  const newCount = currentCount + 1;
  lines[countLineIdx] = lines[countLineIdx].replace(/(stream_data:\s*)\d+/, `$1${newCount}`);

  // Collect all stream_data entries with their indices and payloads
  const entryRegex = /^\s*stream_data\[(\d+)\]:\s*"([^"]*)"/;
  const entries = [];
  let firstEntryIdx = -1;
  let afterEntriesInsertIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(entryRegex);
    if (m) {
      if (firstEntryIdx === -1) firstEntryIdx = i;
      const idx = Number(m[1]);
      const payload = m[2];
      entries.push({ lineIdx: i, idx, payload });
      afterEntriesInsertIdx = i; // will end up as last entry line index
    }
  }
  if (entries.length === 0) throw new Error('No stream_data entries found');

  // Parse payloads to find the station to insert after
  const parsed = entries
    .sort((a, b) => a.idx - b.idx)
    .map(e => ({ ...e, fields: e.payload.split('|') }));

  const targetPos = parsed.findIndex(e => (e.fields[1] || '').trim().toLowerCase() === afterName.trim().toLowerCase());
  if (targetPos === -1) throw new Error(`Station named "${afterName}" not found`);

  const insertPos = targetPos + 1; // after the target

  // Build new entries array including insertion and reindexing
  const newPayload = [
    station.url,
    station.name,
    station.genre,
    station.lang ?? 'EN',
    station.bitrate ?? '',
    station.favorite ?? '0',
  ].join('|');

  const rebuilt = [];
  for (let i = 0; i < parsed.length + 1; i++) {
    if (i < insertPos) {
      rebuilt.push({ idx: i, payload: parsed[i].payload });
    } else if (i === insertPos) {
      rebuilt.push({ idx: i, payload: newPayload });
    } else {
      // shift existing by +1
      rebuilt.push({ idx: i, payload: parsed[i - 1].payload });
    }
  }

  // Replace the block of stream_data lines in-place: remove original entry lines and inject rebuilt lines at firstEntryIdx
  lines.splice(firstEntryIdx, entries.length, ...rebuilt.map(e => ` stream_data[${e.idx}]: "${e.payload}"`));

  writeFileSync(filePath, lines.join('\n'), 'utf8');
}
