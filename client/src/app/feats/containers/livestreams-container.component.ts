import { Component, OnInit, signal, inject } from '@angular/core';
import { filter, finalize, map, switchMap, tap } from 'rxjs/operators';
import { CommonModule } from '@angular/common';

type Channel = {
  index: number;
  url: string;
  name: string;
  genre: string;
  lang: string;
  bitrate: string;
  favorite: string; // '0' | '1'
};

import { LiveStreamsUtilFactoryService } from '../../live-streams-util-factory.service';

@Component({
  selector: 'app-livestreams-container',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './livestreams-container.component.html',
})
export class LivestreamsContainerComponent implements OnInit {
  private readonly util = inject(LiveStreamsUtilFactoryService);
  channels = signal<Channel[]>([]);
  total = signal(0);
  loading = signal(true);
  loaded = signal(false);
  playingIndex = signal<number | null>(null);
  loadingIndex = signal<number | null>(null);
  errorIndex = signal<number | null>(null);
  private audioElement: HTMLAudioElement | null = null;

  // Helper kept in case we want chips later
  getGenreTags(genre: string | undefined | null): string[] {
    return String(genre ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  playStream(channel: Channel) {
    if (this.playingIndex() === channel.index) {
      this.stopStream();
      return;
    }

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }

    this.playingIndex.set(null);
    this.errorIndex.set(null);
    this.loadingIndex.set(channel.index);
    this.audioElement = new Audio(channel.url);
    this.audioElement.play().then(() => {
      this.loadingIndex.set(null);
      this.playingIndex.set(channel.index);
    }).catch(err => {
      this.loadingIndex.set(null);
      this.errorIndex.set(channel.index);
      console.error('Failed to play stream:', err);
      alert(`Unable to play stream: ${channel.name}`);
    });
  }

  stopStream() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }
    this.playingIndex.set(null);
  }

  // --- Validation helpers (pure, focused) ---
  private hasCorrectPipeCount(payload: string, expected = 5): boolean {
    const count = (payload.match(/\|/g) || []).length;
    return count === expected;
  }
  private hasNoWhitespaceAroundPipes(payload: string): boolean {
    return !(/[\s]\|/.test(payload) || /\|[\s]/.test(payload));
  }
  private isValidFavorite(value: string): boolean {
    return value === '0' || value === '1';
  }
  private isValidBitrate(value: string): boolean {
    return value === '' || /^[0-9]+$/.test(value);
  }
  private parseEntries(text: string): Array<{ line: number; index: number; payload: string; }>{
    const lines = text.split(/\r?\n/);
    const entryRe = /^\s*stream_data\[(\d+)\]:\s*"([^"]*)"/;
    const entries: Array<{ line:number; index:number; payload:string; }> = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(entryRe);
      if (m) entries.push({ line: i + 1, index: Number(m[1]), payload: m[2] });
    }
    return entries.sort((a,b) => a.index - b.index);
  }
  private validateEntry(payload: string) {
    const issues: string[] = [];
    if (!this.hasCorrectPipeCount(payload)) issues.push('PIPE_COUNT: expected 5 pipes (6 fields)');
    if (!this.hasNoWhitespaceAroundPipes(payload)) issues.push('PIPE_WHITESPACE: whitespace around pipe');
    const parts = payload.split('|');
    if (parts.length >= 6) {
      const [url, name, , , bitrate, favorite] = parts;
      if (!url) issues.push('URL_EMPTY');
      if (!name) issues.push('NAME_EMPTY');
      if (!this.isValidBitrate(bitrate)) issues.push('BITRATE_INVALID');
      if (!this.isValidFavorite(favorite)) issues.push("FAVORITE_INVALID");
    }
    return { ok: issues.length === 0, issues, fieldsCount: parts.length };
  }
  private validateText(text: string) {
    const entries = this.parseEntries(text);
    const results = entries.map(e => ({ e, v: this.validateEntry(e.payload) }));
    const invalid = results.filter(r => !r.v.ok);
    return { ok: invalid.length === 0, entries, invalid };
  }

  onImport() {
    this.util.chooseImportFile().pipe(
      filter((p): p is string => !!p),
      switchMap((path) => this.util.readTextFile(path).pipe(map(text => ({ path, text })))),
      map(({ path, text }) => ({ path, report: this.validateText(String(text ?? '')) })),
tap(({ report }) => {
        if (!report.ok) {
          const formatInvalidPreview = (items: Array<{ e: { line: number; index: number }; v: { issues: string[] } }>) =>
            items
              .slice(0, 5)
              .map(r => `line ${r.e.line} idx ${r.e.index}: ${r.v.issues.join(', ')}`)
              .join('\n');

          const first = formatInvalidPreview(report.invalid);
          alert(`Invalid live_streams.sii format (\ninvalid entries: ${report.invalid.length}/${report.entries.length}\n)\n\nExamples:\n${first}`);
        }
      }),
      filter(({ report }) => report.ok),
      switchMap(({ path }) => this.util.importLiveStreamsFromPath(path, 'live_streams.sii')),
      filter((res) => !!res && !res.canceled),
      switchMap(() => this.util.findGameChannels('live_streams.sii')),
      tap((res) => {
        this.channels.set(res.channels ?? []);
        this.total.set(res.total ?? res.channels?.length ?? 0);
      })
    ).subscribe({ error: (e) => console.error('Import failed', e) });
  }

  onExport() {
    this.util.exportLiveStreams('live_streams.sii', 'live_streams.sii').subscribe({
      next: (res) => { if (!res?.canceled) console.log('Exported to', res.destPath); },
      error: (e) => console.error('Export failed', e)
    });
  }

  ngOnInit() {
    this.loading.set(true);
    this.util.findGameChannels('live_streams.sii').pipe(
      tap((res) => {
        this.channels.set(res.channels ?? []);
        this.total.set(res.total ?? res.channels?.length ?? 0);
      }),
      finalize(() => {
        this.loading.set(false);
        this.loaded.set(true);
      })
    ).subscribe();
  }
}
