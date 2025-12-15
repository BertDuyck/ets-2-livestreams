import { Component, OnInit, signal } from '@angular/core';
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
          <button type="button" (click)="onExport()"
                  class="inline-flex items-center gap-2 rounded-md bg-gray-900 text-white text-sm px-3 py-1.5 hover:bg-black/80">
            Export live_streams.sii
          </button>
        </div>

        <div *ngIf="loading()" class="rounded-xl border border-white/5 bg-[var(--ets-panel)]/95 p-6">
          <div class="animate-pulse h-4 bg-white/10 rounded w-40 mb-3"></div>
          <div class="animate-pulse h-4 bg-white/10 rounded w-64"></div>
        </div>

        <div *ngIf="error()" class="rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-red-200">
          {{ error() }}
        </div>

        <div *ngIf="!loading() && !error()" class="overflow-auto rounded-md border border-gray-200 bg-white text-black">
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
  channels = signal<Channel[]>([]);
  total = signal(0);
  loading = signal(true);
  loaded = signal(false);
  error = signal<string | null>(null);

  // Helper kept in case we want chips later
  getGenreTags(genre: string | undefined | null): string[] {
    return String(genre ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  async onExport() {
    try {
      const res = await (window as any).api?.exportLiveStreams?.('live_streams.sii', 'live_streams.sii');
      if (!res || res.canceled) return;
      // Optional: simple visual feedback in the title line — could be replaced later
      // For now we just log; you can wire a toast later
      console.log('Exported to', res.destPath);
    } catch (e) {
      console.error('Export failed', e);
    }
  }

  async ngOnInit() {
    try {
      this.loading.set(true);
      const res = await (window as any).api?.findGameChannels?.('live_streams.sii')
        ?? { total: 0, filteredCount: 0, channels: [] };
      this.channels.set(res.channels ?? []);
      this.total.set(res.total ?? res.channels?.length ?? 0);
      this.error.set(null);
    } catch (e: any) {
      this.error.set(e?.message ?? String(e));
    } finally {
      this.loading.set(false);
      this.loaded.set(true);
    }
  }
}
