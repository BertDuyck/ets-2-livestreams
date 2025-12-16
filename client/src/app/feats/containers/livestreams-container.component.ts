import { Component, OnInit, signal, inject, NgZone } from '@angular/core';
import { catchError, exhaustMap, filter, finalize, map, switchMap, tap } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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
import { defer, EMPTY, from, Subject } from 'rxjs';

@Component({
  selector: 'app-livestreams-container',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './livestreams-container.component.html',
})
export class LivestreamsContainerComponent implements OnInit {
  private readonly util = inject(LiveStreamsUtilFactoryService);
  private readonly zone = inject(NgZone);
  channels = signal<Channel[]>([]);
  originalChannels: Channel[] = [];
  editingFields = new Map<string, string>(); // Temporary editing values
  modifiedFields = signal<Set<string>>(new Set());
  total = signal(0);
  loading = signal(true);
  loaded = signal(false);
  playingIndex = signal<number | null>(null);
  playingStreamUrl = signal<string | null>(null);
  loadingIndex = signal<number | null>(null);
  errorIndex = signal<number | null>(null);
  private audioElement: HTMLAudioElement | null = null;
  private readonly playStream$ = new Subject<Channel | null>();
  
  // Add form related
  showAddForm = signal(false);
  newChannel: Partial<Channel> = {};

  // constructor() {
  //   this.playStream$.pipe(
  //     exhaustMap(channel => {
  //     })
  //   ).subscribe();
  // }

  favoriteChanged(index: number, event: Event) {
    const isChecked = (event.target as HTMLInputElement).checked;
    const channels = this.channels();
    const channel = channels.find(c => c.index === index);
    if (!channel) return;
    const updatedChannels = channels.map(c => c.index === index ? { ...c, favorite: isChecked ? '1' : '0' } : c);
    this.channels.set(updatedChannels);

    this.onSave();
  }

  // Store temporary edit value without updating the signal
  onFieldEdit(index: number, field: keyof Channel, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    const fieldKey = `${index}-${field}`;
    this.editingFields.set(fieldKey, value);
  }

    // Handle keyboard events on input fields
  onFieldKeydown(index: number, field: keyof Channel, event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.applyFieldChange(index, field);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      const fieldKey = `${index}-${field}`;
      this.editingFields.delete(fieldKey);
      // Reset the input value to the original
      const channel = this.channels().find(c => c.index === index);
      if (channel) {
        (event.target as HTMLInputElement).value = String(channel[field] || '');
      }
    }
  }

    // Get the current editing value or the actual value
  getFieldValue(index: number, field: keyof Channel): string {
    const fieldKey = `${index}-${field}`;
    if (this.editingFields.has(fieldKey)) {
      return this.editingFields.get(fieldKey) || '';
    }
    const channel = this.channels().find(c => c.index === index);
    return channel ? String(channel[field] || '') : '';
  }

  // Apply the edited value when user clicks the apply button
  applyFieldChange(index: number, field: keyof Channel) {
    const fieldKey = `${index}-${field}`;
    const value = this.editingFields.get(fieldKey);
    if (value === undefined) return;
    
    const channels = this.channels();
    const channel = channels.find(c => c.index === index);
    if (!channel) return;
    
    // Validate based on field type
    if (field === 'bitrate' && value !== '' && !/^[0-9]+$/.test(value)) {
      this.showAlert('Invalid bitrate. Please enter only numbers.');
      this.editingFields.delete(fieldKey);
      return;
    }
    
    const updatedChannels = channels.map(c => 
      c.index === index ? { ...c, [field]: value } : c
    );
    this.channels.set(updatedChannels);
    this.editingFields.delete(fieldKey); // Clear the editing value

    this.onSave();
  }

    // Check if a field has pending changes
  hasFieldPendingChanges(index: number, field: keyof Channel): boolean {
    const fieldKey = `${index}-${field}`;
    if (!this.editingFields.has(fieldKey)) return false;
    
    const channel = this.channels().find(c => c.index === index);
    if (!channel) return false;
    
    return this.editingFields.get(fieldKey) !== String(channel[field] || '');
  }

  isFieldModified(index: number, field: keyof Channel): boolean {
    return this.modifiedFields().has(`${index}-${field}`);
  }

  hasChanges(): boolean {
    return this.modifiedFields().size > 0 || this.editingFields.size > 0;
  }

  // Check if channels have been added or removed
  hasStructuralChanges(): boolean {
    const currentChannels = this.channels();
    if (currentChannels.length !== this.originalChannels.length) {
      return true;
    }
    // Check if any channel has a deletion marker
    return Array.from(this.modifiedFields()).some(field => field.endsWith('-deleted'));
  }

    resetChanges() {
    if (confirm('Are you sure you want to discard all changes?')) {
      this.channels.set([...this.originalChannels]);
      this.modifiedFields.set(new Set());
      this.editingFields.clear();
    }
      
    this.util.refocusMainWindow();
  }

  // Get the next available index (max current index + 1)
  getNextIndex(): number {
    const channels = this.channels();
    if (channels.length === 0) return 0;
    return Math.max(...channels.map(c => c.index)) + 1;
  }

  // Initialize the new channel form
  initNewChannel() {
    this.newChannel = {
      index: this.getNextIndex(),
      url: '',
      name: '',
      genre: '',
      lang: 'EN',
      bitrate: '',
      favorite: '0'
    };
    this.showAddForm.set(true);
  }

  // Cancel adding a new channel
  cancelAddChannel() {
    this.showAddForm.set(false);
    this.newChannel = {};
  }

    // Handle favorite checkbox change in add form
  onNewChannelFavoriteChange(event: Event) {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.newChannel.favorite = isChecked ? '1' : '0';
  }

  getChannelByIndex(index: number): Channel | undefined {
    return this.channels().find(c => c.index === index);
  }

    // Remove a channel and update indices
  removeChannel(index: number) {
    if (!confirm(`Are you sure you want to remove the channel at index ${index}?`)) {
      this.util.refocusMainWindow();

      return;
    }

    if (this.playingStreamUrl() === this.getChannelByIndex(index)?.url) {
      this.stopStream();
    }

    const channels = this.channels();
    const updatedChannels = channels
      .filter(c => c.index !== index)
      .map(c => {
        // Decrement index for all channels after the removed one
        if (c.index > index) {
          return { ...c, index: c.index - 1 };
        }
        return c;
      });
    
    // Update channels
    this.channels.set(updatedChannels);
    
    // Mark all affected channels as modified
    const modifiedSet = new Set(this.modifiedFields());
    
    // Mark the removed channel's index as deleted (we'll need this for tracking)
    // Add a special marker for deletion
    modifiedSet.add(`${index}-deleted`);
    
    // Mark all shifted channels as modified
    updatedChannels.forEach(c => {
      const originalChannel = this.originalChannels.find(oc => 
        // Find by original position - channels after the deleted one were at index+1
        oc.index === (c.index >= index ? c.index + 1 : c.index)
      );
      
      if (originalChannel && originalChannel.index > index) {
        // This channel was shifted, mark all its fields as modified
        ['url', 'name', 'genre', 'lang', 'bitrate', 'favorite'].forEach(field => {
          modifiedSet.add(`${c.index}-${field}`);
        });
      }
    });
    
    this.modifiedFields.set(modifiedSet);
    
    // Clear any editing fields for the removed channel and shifted channels
    const keysToRemove: string[] = [];
    this.editingFields.forEach((_, key) => {
      const [indexStr] = key.split('-');
      const editIndex = parseInt(indexStr);
      if (editIndex >= index) {
        keysToRemove.push(key);
      }
    });
    keysToRemove.forEach(key => this.editingFields.delete(key));

    this.errorIndex.set(null);

    this.util.refocusMainWindow();
    this.onSave();
  }

  // Add the new channel
  addChannel() {
    // Validate required fields
    if (!this.newChannel.url || !this.newChannel.name) {
      this.showAlert('URL and Name are required fields');
      return;
    }

    // Validate index
    const maxIndex = this.getNextIndex();
    const newIndex = this.newChannel.index ?? maxIndex;
    if (newIndex < 0 || newIndex > maxIndex) {
      this.showAlert(`Index must be between 0 and ${maxIndex}`);
      return;
    }

    // Validate bitrate if provided
    if (this.newChannel.bitrate && !/^[0-9]*$/.test(this.newChannel.bitrate)) {
      this.showAlert('Bitrate must be a number');
      return;
    }

    const channels = this.channels();
    const newChannelData: Channel = {
      index: newIndex,
      url: this.newChannel.url || '',
      name: this.newChannel.name || '',
      genre: this.newChannel.genre || '',
      lang: this.newChannel.lang || 'EN',
      bitrate: this.newChannel.bitrate || '',
      favorite: this.newChannel.favorite || '0'
    };

    // If inserting at an existing index, shift all subsequent entries up
    const updatedChannels = [...channels];
    const existingAtIndex = updatedChannels.find(c => c.index === newIndex);
    
    if (existingAtIndex) {
      // Shift all channels at or after this index up by 1
      updatedChannels.forEach(c => {
        if (c.index >= newIndex) {
          c.index++;
        }
      });
    }

    // Add the new channel
    updatedChannels.push(newChannelData);
    
    // Sort by index
    updatedChannels.sort((a, b) => a.index - b.index);
    
    // Update channels and track as modified
    this.channels.set(updatedChannels);
    
    // Mark all shifted channels and the new channel as modified
    const modifiedSet = new Set(this.modifiedFields());
    updatedChannels.forEach(c => {
      if (c.index >= newIndex) {
        // Mark all fields of affected channels as modified
        ['url', 'name', 'genre', 'lang', 'bitrate', 'favorite'].forEach(field => {
          modifiedSet.add(`${c.index}-${field}`);
        });
      }
    });
    this.modifiedFields.set(modifiedSet);

    if (this.playingStreamUrl() === this.newChannel.url) {
      this.stopStream();
      this.playStream(newChannelData);
    }

    // Reset the form
    this.showAddForm.set(false);
    this.newChannel = {};

    this.onSave();
  }

  // Helper kept in case we want chips later
  getGenreTags(genre: string | undefined | null): string[] {
    return String(genre ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  testStreamUrl(url: string) {
    if (!url) {
      this.showAlert('Please enter a stream URL to test.');
      return;
    }

    if (this.playingStreamUrl() === url) {
      this.stopStream();
      return;
    }

    this.stopStream();
    this.loadingIndex.set(-1); // Special index for test
    this.errorIndex.set(null);
    this.audioElement = new Audio(url); 
    if (this.audioElement) {
      defer(() => this.audioElement ? this.audioElement.play().catch() : Promise.resolve()).pipe(
        catchError(err => {
          if (this.audioElement?.src === url) {
            this.loadingIndex.set(null);
            this.errorIndex.set(-1);
            console.error('Failed to play test stream:', err);
            return EMPTY;
          }
          return EMPTY;
        })
      ).subscribe(() => {
        this.loadingIndex.set(null);
        this.playingStreamUrl.set(url);
      });
    }
  }

  playStream(channel: Channel) {
    this.loadingIndex.set(channel.index);
    
    if (this.playingStreamUrl() === channel.url) {
      this.stopStream();
      this.loadingIndex.set(null);
      return;
    }

    this.stopStream();

    this.errorIndex.set(null);
    this.audioElement = new Audio(channel.url);

    if (this.audioElement) {
      defer(() => this.audioElement ? this.audioElement.play().catch() : Promise.resolve()).pipe(
        catchError(err => {
          if (this.audioElement?.src === channel.url) {
          // this.showAlert(`Unable to play stream: ${channel.name}, ${this.audioElement?.src} ${channel.url}`);
            this.loadingIndex.set(null);
            this.errorIndex.set(channel.index);
            console.error('Failed to play stream:', err);

            return EMPTY;
          }
          // this.showAlert(`Unable to play stream: ${channel.name}`);
          return EMPTY;
        })
      ).subscribe(() => {
        this.loadingIndex.set(null);
        this.playingStreamUrl.set(channel.url);
      });
    }
  }

  stopStream() {
    if (this.audioElement) {
      console.log('Stopping stream', this.audioElement.src, this.audioElement.networkState);
      this.audioElement.pause();

      this.audioElement = null;
    }
    this.playingStreamUrl.set(null);
  }

  showAlert(message: string) {
    this.zone.run(() => {
      alert(message);
      this.util.refocusMainWindow();
    }); 
  }

  sortChannelsByField(field: keyof Channel) {
    // Apply any pending edits first
    if(!this.confirmPendingEdits()) {
      return;
    }

    const channels = this.channels();
    const sorted = [...channels].sort((a, b) => {
      const valA = String(a[field] || '').toLowerCase();
      const valB = String(b[field] || '').toLowerCase();
      return valA.localeCompare(valB);
    });
    const remapNumbers = sorted.map((ch, idx) => ({ ...ch, index: idx }));
    this.channels.set(remapNumbers);

    this.onSave();
    // this.util.refocusMainWindow();
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
          this.showAlert(`Invalid live_streams.sii format (\ninvalid entries: ${report.invalid.length}/${report.entries.length}\n)\n\nExamples:\n${first}`);
        }
      }),
      filter(({ report }) => report.ok),
      switchMap(({ path }) => this.util.importLiveStreamsFromPath(path, 'live_streams.sii')),
      filter((res) => !!res && !res.canceled),
      switchMap(() => this.util.findGameChannels('live_streams.sii')),
            tap((res) => {
        this.channels.set(res.channels ?? []);
        this.originalChannels = JSON.parse(JSON.stringify(res.channels ?? []));
        this.modifiedFields.set(new Set());
        this.editingFields.clear();
        this.total.set(res.total ?? res.channels?.length ?? 0);
      })
    ).subscribe({ error: (e) => console.error('Import failed', e) });
  }

  confirmPendingEdits(): boolean {
    if (this.editingFields.size > 0) {
      const confirmApply = confirm('You have some remaining pending edits. Apply them before saving?');
      if (confirmApply) {
        // Apply all pending changes
        for (const [fieldKey, value] of this.editingFields.entries()) {
          const [indexStr, field] = fieldKey.split('-');
          const index = parseInt(indexStr);
          const channels = this.channels();
          const updatedChannels = channels.map(c => 
            c.index === index ? { ...c, [field]: value } : c
          );
          this.channels.set(updatedChannels);
        }
        this.editingFields.clear();

        this.util.refocusMainWindow();
      } else {
        this.util.refocusMainWindow();
        return false; // Don't save if user cancels
      }
    }
        
    return true;
  }

  onSave() {
    // Apply any pending edits first
    if(!this.confirmPendingEdits()) {
      return;
    }

    // Save the current (possibly modified) channel data to the original file
    const currentChannels = this.channels();
    this.util.saveLiveStreamsData(currentChannels, 'live_streams.sii').subscribe({
      next: (res) => { 
        if (res?.success) {
          console.log('Changes saved successfully');
          // this.showAlert('Changes saved successfully to live_streams.sii');
          // Update original channels and clear modifications tracking
          this.originalChannels = JSON.parse(JSON.stringify(currentChannels));
          this.modifiedFields.set(new Set());
          this.editingFields.clear();
        } else {
          console.error('Save failed:', res?.error);
          this.showAlert(`Failed to save changes: ${res?.error || 'Unknown error'}`);
        }
      },
      error: (e) => {
        console.error('Save failed', e);
        this.showAlert('Save failed. Please check the console for details.');
      }
    });
  }

  onExport() {
    // Export with the current (possibly modified) channel data
    const currentChannels = this.channels();
    this.util.exportLiveStreamsWithData(currentChannels, 'live_streams.sii', 'live_streams.sii').subscribe({
      next: (res) => { 
        if (!res?.canceled) {
          console.log('Exported to', res.destPath);
          this.showAlert(`Successfully exported live_streams.sii with updated favorites to:\n${res.destPath}`);
        }
      },
      error: (e) => {
        console.error('Export failed', e);
        this.showAlert('Export failed. Please check the console for details.');
      }
    });
  }

  ngOnInit() {
    this.loading.set(true);
    this.util.findGameChannels('live_streams.sii').pipe(
            tap((res) => {
        this.channels.set(res.channels ?? []);
        this.originalChannels = JSON.parse(JSON.stringify(res.channels ?? []));
        this.modifiedFields.set(new Set());
        this.editingFields.clear();
        this.total.set(res.total ?? res.channels?.length ?? 0);
      }),
      finalize(() => {
        this.loading.set(false);
        this.loaded.set(true);
      })
    ).subscribe();
  }
}
