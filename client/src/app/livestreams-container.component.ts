import { Component, OnInit, signal, inject } from '@angular/core';
import { of } from 'rxjs';
import { filter, finalize, map, switchMap, tap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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

import { LiveStreamsUtilFactoryService } from './live-streams-util-factory.service';

@Component({
  selector: 'app-livestreams-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="min-h-screen p-6">
      <div class="mx-auto max-w-6xl">
<header class="flex items-center gap-3 mb-3 rounded-md bg-gray-100 px-3 py-2 border border-gray-200">
          <div class="h-6 w-1.5 rounded bg-[var(--ets-accent)]"></div>
          <h1 class="text-2xl font-semibold tracking-tight">Radio Editor</h1>
        </header>

<div class="mb-3 flex items-center justify-between">
          <div class="text-sm text-gray-600" *ngIf="loaded()">
            Total channels: <span class="text-gray-900 font-medium">{{ total() }}</span>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" (click)="onImport()"
                    class="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white text-gray-900 text-sm px-3 py-1.5 hover:bg-gray-50">
              Import live_streams.sii
            </button>
            <button type="button" (click)="onExport()"
                    class="inline-flex items-center gap-2 rounded-md bg-gray-900 text-white text-sm px-3 py-1.5 hover:bg-black/80">
              Export live_streams.sii
            </button>
          </div>
        </div>

        <div *ngIf="loading()" class="rounded-xl border border-white/5 bg-[var(--ets-panel)]/95 p-6">
          <div class="animate-pulse h-4 bg-white/10 rounded w-40 mb-3"></div>
          <div class="animate-pulse h-4 bg-white/10 rounded w-64"></div>
        </div>

        <div *ngIf="!loading()" class="overflow-auto rounded-md border border-gray-200 bg-white text-black">
          <table class="min-w-full text-sm table-auto border-collapse">
            <thead class="text-left bg-gray-50">
              <tr class="border-b border-gray-200">
                <th class="py-2 px-3">#</th>
                <th class="py-2 px-3">Name</th>
                <th class="py-2 px-3">URL</th>
                <th class="py-2 px-3">Genre</th>
                <th class="py-2 px-3">Lang</th>
                <th class="py-2 px-3">Bitrate</th>
                <th class="py-2 px-3">Favorite</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let ch of channels()" class="border-b border-gray-200">
                <td class="py-2 px-3">{{ ch.index }}</td>
                <td class="py-2 px-3">{{ ch.name || 'Unnamed Station' }}</td>
                <td class="py-2 px-3 break-all">{{ ch.url }}</td>
                <td class="py-2 px-3">{{ ch.genre }}</td>
                <td class="py-2 px-3">{{ ch.lang }}</td>
                <td class="py-2 px-3">{{ ch.bitrate }}</td>
                <td class="py-2 px-3">{{ ch.favorite === '1' ? 'Yes' : 'No' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `,
})
export class LivestreamsContainerComponent implements OnInit {
  private readonly util = inject(LiveStreamsUtilFactoryService);
  channels = signal<Channel[]>([]);
  total = signal(0);
  loading = signal(true);
  loaded = signal(false);

  // Helper kept in case we want chips later
  getGenreTags(genre: string | undefined | null): string[] {
    return String(genre ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
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
      takeUntilDestroyed(),
      filter((p): p is string => !!p),
      switchMap((path) => this.util.readTextFile(path).pipe(map(text => ({ path, text })))),
      map(({ path, text }) => ({ path, report: this.validateText(String(text ?? '')) })),
      tap(({ report }) => {
        if (!report.ok) {
          const first = report.invalid.slice(0, 5).map(r => `line ${r.e.line} idx ${r.e.index}: ${r.v.issues.join(', ')}`).join('\n');
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
    this.util.exportLiveStreams('live_streams.sii', 'live_streams.sii').pipe(
      takeUntilDestroyed()
    ).subscribe({
      next: (res) => { if (!res?.canceled) console.log('Exported to', res.destPath); },
      error: (e) => console.error('Export failed', e)
    });
  }

  ngOnInit() {
    this.loading.set(true);
    this.util.findGameChannels('live_streams.sii').pipe(
      takeUntilDestroyed(),
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
