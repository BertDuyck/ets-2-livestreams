import { Component } from '@angular/core';

@Component({
  selector: 'app-livestreams-container',
  standalone: true,
  template: `
    <section class="min-h-screen p-6">
      <div class="mx-auto max-w-5xl">
        <header class="flex items-center gap-3 mb-8">
          <div class="h-9 w-1.5 rounded bg-[var(--ets-accent)] shadow-[0_0_12px_rgba(212,162,23,0.45)]"></div>
          <h1 class="text-3xl font-semibold tracking-tight">Music</h1>
        </header>

        <div class="rounded-xl border border-white/5 bg-[var(--ets-panel)]/95 backdrop-blur p-6"> 
          <p class="text-sm text-white/70">
            Livestreams will appear here. More sections can be added later via the router.
          </p>
        </div>
      </div>
    </section>
  `,
})
export class LivestreamsContainerComponent {}
