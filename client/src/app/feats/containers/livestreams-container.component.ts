import {
  Component,
  OnInit,
  signal,
  inject,
  NgZone,
  computed,
  ViewChildren,
  ElementRef,
  QueryList,
  Renderer2,
  effect,
} from '@angular/core';
import { catchError, filter, map, switchMap, tap } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LiveStreamsUtilFactoryService } from '../../live-streams-util-factory.service';
import { defer, EMPTY, from, Subject } from 'rxjs';
import { FavoriteCheckComponent } from '../../components/favorite-check/favorite-check.component';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  CdkDragHandle,
  CdkDragPreview,
  CdkDragEnter,
} from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-livestreams-container',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FavoriteCheckComponent,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPreview,
  ],
  templateUrl: './livestreams-container.component.html',
})
export class LivestreamsContainerComponent implements OnInit {
  @ViewChildren('channelRowElement') channelRowElements!: QueryList<ElementRef>;
  private readonly util = inject(LiveStreamsUtilFactoryService);
  private readonly zone = inject(NgZone);
  private readonly renderer = inject(Renderer2);
  modifiedChannels = signal<Channel[] | null>(null);
  originalChannels = signal<Channel[]>([]);
  visibleChannels = computed(() => {
    return this.modifiedChannels() || this.originalChannels();
  });
  editingFields = new Map<string, string>(); // Temporary editing values
  modifiedFields = signal<Set<string>>(new Set());
  total = signal(0);
  loading = signal(true);
  loaded = signal(false);
  playingIndex = signal<number | null>(null);
  playingStreamUrl = signal<string | null>(null);
  loadingChannel = signal<Channel | null>(null);
  errorChannel = signal<Channel | null>(null);
  protected showList = signal(true);
  protected audioElement: HTMLAudioElement | null = new Audio('');
  hasChanges = computed(() => {
    return !!this.modifiedChannels();
  });
  private readonly defaultEmptyChannel: Channel = {
    index: this.getNextIndex(),
    url: '',
    name: '',
    genre: '',
    lang: 'EN',
    bitrate: '128',
    favorite: '1',
    id: this.util.getRandomUuid(),
  };
  audioPlayerChannel = signal<Channel>(this.defaultEmptyChannel);
  newChannelFormData = signal<Channel>(this.defaultEmptyChannel);
  favoriteOnlyChecked = signal(true);

  constructor() {
    effect(() => {
      const audioPlayerChannel = this.audioPlayerChannel();
      if (audioPlayerChannel) {
        this.loadingChannel.set(audioPlayerChannel);
      }

      if (!audioPlayerChannel || !audioPlayerChannel.url) {
        return;
      }

      console.log('audioPlayerChannel', audioPlayerChannel);

      if (audioPlayerChannel?.url) {
        this.loadAudioUrl(audioPlayerChannel.url);

        this.audioElement
          ?.play()
          .catch((err) => {
            if (this.loadingChannel()?.id === audioPlayerChannel.id) {
              this.loadingChannel.set(null);
              this.errorChannel.set(audioPlayerChannel);
              console.error('Failed to play stream:', err);
            }
          })
          .then(() => {
            if (audioPlayerChannel.id === this.loadingChannel()?.id) {
              this.loadingChannel.set(null);
            }

            this.playingStreamUrl.set(audioPlayerChannel.url);
          });
      }
    });
  }

  // Add form related
  showAddForm = signal(false);

  cdkDropListEntered(e: CdkDragEnter<Channel[], Channel[]>) {
    console.log(e);
  }

  cdkDropListDropped(e: CdkDragDrop<Channel[]>) {
    if (e.previousContainer !== e.container) {
      return;
    }

    const currentChannel = this.visibleChannels().at(e.previousIndex);

    if (currentChannel) {
      this.removeChannel(currentChannel.index);
      this.insertChannel({
        ...currentChannel,
        index: e.currentIndex,
      });
    }

    setTimeout(() => {
      const channel = this.channelRowElements.find((el, i) => i === e.currentIndex);

      channel?.nativeElement.classList.add('bg-green-300');
      setTimeout(() => {
        channel?.nativeElement.classList.remove('bg-green-300');
      }, 2000);
    }, 0);
  }

  initializeAudioPlayerChannel() {
    this.audioPlayerChannel.set(this.defaultEmptyChannel);
  }

  toggleFavorite(channel: Channel | undefined | null, checked: boolean) {
    if (!channel) return;
    const channels = this.visibleChannels();
    const updatedChannels = channels.map((c) =>
      c.url === channel.url ? { ...c, favorite: checked ? '1' : '0' } : c
    );
    this.modifiedChannels.set(updatedChannels);
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
      const channel = this.visibleChannels().find((c) => c.index === index);
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
    const channel = this.visibleChannels().find((c) => c.index === index);
    return channel ? String(channel[field] || '') : '';
  }

  // Apply the edited value when user clicks the apply button
  applyFieldChange(index: number, field: keyof Channel) {
    const fieldKey = `${index}-${field}`;
    const value = this.editingFields.get(fieldKey);
    if (value === undefined) return;

    const channels = this.visibleChannels();
    const channel = channels.find((c) => c.index === index);
    if (!channel) return;

    // Validate based on field type
    if (field === 'bitrate' && value !== '' && !/^[0-9]+$/.test(value)) {
      this.showAlert('Invalid bitrate. Please enter only numbers.');
      this.editingFields.delete(fieldKey);
      return;
    }

    const updatedChannels = channels.map((c) => (c.index === index ? { ...c, [field]: value } : c));
    this.modifiedChannels.set(updatedChannels);
    this.editingFields.delete(fieldKey); // Clear the editing value
  }

  // Check if a field has pending changes
  hasFieldPendingChanges(index: number, field: keyof Channel): boolean {
    const fieldKey = `${index}-${field}`;
    if (!this.editingFields.has(fieldKey)) return false;

    const channel = this.visibleChannels().find((c) => c.index === index);
    if (!channel) return false;

    return this.editingFields.get(fieldKey) !== String(channel[field] || '');
  }

  isFieldModified(index: number, field: keyof Channel): boolean {
    return this.modifiedFields().has(`${index}-${field}`);
  }

  resetChanges() {
    if (this.getConfirm('Are you sure you want to discard all changes?')) {
      this.modifiedChannels.set(null);
      this.editingFields.clear();
    }
  }

  // Get the next available index (max current index + 1)
  getNextIndex(): number {
    const channels = this.visibleChannels();
    if (channels.length === 0) return -1;
    return Math.max(...channels.map((c) => c.index)) + 1;
  }

  // Initialize the new channel form
  initNewChannel() {
    this.newChannelFormData.set({
      ...this.defaultEmptyChannel,
      index: this.getNextIndex(),
      id: this.util.getRandomUuid(),
    });
    this.showAddForm.set(true);
  }

  // Cancel adding a new channel
  cancelAddChannel() {
    this.newChannelFormData.set(this.defaultEmptyChannel);
    this.showAddForm.set(false);
  }

  getChannelByIndex(index: number): Channel | undefined {
    return this.visibleChannels().find((c) => c.index === index);
  }

  playRadioPlayer() {
    if (this.audioElement?.src) {
      if (this.audioElement.paused) {
        this.audioElement.play();
        return;
      }
      this.audioElement.pause();
      return;
    }
  }

  playVisibleChannel(channel: Channel) {
    this.favoriteOnlyChecked.set(channel.favorite === '1');
    this.playStream(channel);
  }

  // Remove a channel and update indices
  removeChannel(index: number) {
    this.applyPendingEdits();

    if (this.playingStreamUrl() === this.getChannelByIndex(index)?.url) {
      this.unloadAudioUrl();
    }

    const channels = this.visibleChannels();
    const updatedChannels = channels
      .filter((c) => c.index !== index)
      .map((c) => {
        // Decrement index for all channels after the removed one
        if (c.index > index) {
          return { ...c, index: c.index - 1 };
        }
        return c;
      });

    // Update channels
    this.modifiedChannels.set(updatedChannels);

    // Clear any editing fields for the removed channel and shifted channels
    const keysToRemove: string[] = [];
    this.editingFields.forEach((_, key) => {
      const [indexStr] = key.split('-');
      const editIndex = parseInt(indexStr);
      if (editIndex >= index) {
        keysToRemove.push(key);
      }
    });
    keysToRemove.forEach((key) => this.editingFields.delete(key));

    this.errorChannel.set(null);
  }

  newChannelIndexChange(index: number) {
    this.newChannelFormData.set({
      ...this.newChannelFormData(),
      index: index,
    });
  }

  newChannelNamelChange(name: string) {
    this.newChannelFormData.set({
      ...this.newChannelFormData(),
      name: name,
    });
  }

  newChannelUrlChange(url: string) {
    this.newChannelFormData.set({
      ...this.newChannelFormData(),
      url: url,
    });
  }

  newChannelGenreChange(genre: string) {
    this.newChannelFormData.set({
      ...this.newChannelFormData(),
      genre: genre,
    });
  }

  newChannelLanguageChange(language: string) {
    this.newChannelFormData.set({
      ...this.newChannelFormData(),
      lang: language,
    });
  }

  // Handle favorite checkbox change in add form
  onNewChannelFavoriteChange(isChecked: boolean) {
    this.newChannelFormData.set({
      ...this.newChannelFormData(),
      favorite: isChecked ? '1' : '0',
    });
  }

  newChannelBitrateChange(bitrate: string) {
    this.newChannelFormData.set({
      ...this.newChannelFormData(),
      bitrate: bitrate || '0',
    });
  }

  insertChannel(channel: Channel) {
    const channels = this.visibleChannels();

    // If inserting at an existing index, shift all subsequent entries up
    const updatedChannels = [...channels];
    const existingAtIndex = updatedChannels.find((c) => c.index === channel.index);

    if (existingAtIndex) {
      // Shift all channels at or after this index up by 1
      updatedChannels.forEach((c) => {
        if (c.index >= channel.index) {
          c.index++;
        }
      });
    }

    // Add the new channel
    updatedChannels.push(channel);

    // Sort by index
    updatedChannels.sort((a, b) => a.index - b.index);

    // Update channels and track as modified
    this.modifiedChannels.set(updatedChannels);

    if (this.audioPlayerChannel()?.id === channel.id) {
      // this.unloadAudioUrl();
      this.initializeAudioPlayerChannel();
      this.playStream(channel);
      setTimeout(() => {
        this.channelRowElements
          .find((element, i) => i === channel.index)
          ?.nativeElement?.scrollIntoView({
            behaviour: 'smooth',
            block: 'center',
          });
      }, 0);
    }
  }

  // Add the new channel
  addChannel() {
    this.applyPendingEdits();

    // Validate required fields
    if (!this.newChannelFormData().url || !this.newChannelFormData().name) {
      this.showAlert('URL and Name are required fields');
      return;
    }

    // Validate index
    const maxIndex = this.getNextIndex();
    const newIndex = this.newChannelFormData().index;
    if (newIndex < 0 || newIndex > maxIndex) {
      this.showAlert(`Index must be between 0 and ${maxIndex}`);
      return;
    }
    this.newChannelFormData.set({
      ...this.newChannelFormData(),
      index: newIndex,
    });

    // Validate bitrate if provided
    if (this.newChannelFormData().bitrate && !/^[0-9]*$/.test(this.newChannelFormData().bitrate)) {
      this.showAlert('Bitrate must be a number');
      return;
    }

    this.insertChannel(this.newChannelFormData());

    // Reset the form
    this.newChannelFormData.set(this.defaultEmptyChannel);
    this.showAddForm.set(false);
  }

  // Helper kept in case we want chips later
  getGenreTags(genre: string | undefined | null): string[] {
    return String(genre ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  playNextChannel(channel: Channel) {
    if (!channel) {
      return;
    }
    const channels = this.visibleChannels();
    const currentIndex = channels.findIndex((c) => c.id === channel.id);

    const channelToPlay = this.favoriteOnlyChecked()
      ? this.visibleChannels().find((c) => c.index > currentIndex && c.favorite === '1') ||
        [...this.visibleChannels()].find((c) => c.favorite === '1')
      : channels[currentIndex + 1] || this.visibleChannels().at(0);

    if (!channelToPlay) {
      return;
    }
    this.playStream(channelToPlay);
  }

  playPreviousChannel(channel?: Channel | null) {
    if (!channel) {
      return;
    }
    const channels = this.visibleChannels();
    const currentIndex = channels.findIndex((c) => c.id === channel.id);

    const channelToPlay = this.favoriteOnlyChecked()
      ? [...this.visibleChannels()]
          .reverse()
          .find((c) => c.index < currentIndex && c.favorite === '1') ||
        [...this.visibleChannels()].reverse().find((c) => c.favorite === '1')
      : channels[currentIndex - 1] || this.visibleChannels().at(this.visibleChannels().length - 1);

    if (!channelToPlay) {
      return;
    }
    this.playStream(channelToPlay);
  }

  loadAudioUrl(url: string) {
    if (!this.audioElement) {
      this.audioElement = new Audio(url);
    }
    this.audioElement?.setAttribute('src', url);
  }

  unloadAudioUrl() {
    if (this.audioElement) {
      console.log('Stopping stream', this.audioElement.src, this.audioElement.networkState);
      this.audioElement.pause();

      this.audioElement.src = '';
    }
    this.playingStreamUrl.set(null);
  }

  loadAudioChannel(channel: Channel) {
    this.audioPlayerChannel.set(channel);
  }

  playStream(channel: Channel) {
    if (!this.audioElement) {
      this.audioElement = new Audio(channel.url);
    }

    if (this.errorChannel()?.id === channel.id) {
      this.errorChannel.set(null);
      this.initializeAudioPlayerChannel();
      // this.unloadAudioUrl();
      this.loadAudioChannel(channel);
      return;
    }

    this.errorChannel.set(null);

    if (this.audioPlayerChannel()?.id === channel.id || this.loadingChannel()?.id === channel.id) {
      this.unloadAudioUrl();
      this.loadingChannel.set(null);
      this.initializeAudioPlayerChannel();
      return;
    }

    this.loadAudioChannel(channel);

    this.channelRowElements
      .find((element, i) => i === channel.index)
      ?.nativeElement?.scrollIntoView({
        behaviour: 'smooth',
        block: 'center',
      });
  }

  showAlert(message: string) {
    this.zone.run(() => {
      alert(message);
      this.util.refocusMainWindow();
    });
  }

  sortChannelsByField(field: keyof Channel, dest: 'asc' | 'desc' = 'asc') {
    this.applyPendingEdits();

    const channels = this.visibleChannels();
    const sorted = [...channels].sort((a, b) => {
      if (dest === 'desc') {
        const valA = String(b[field] || '').toLowerCase();
        const valB = String(a[field] || '').toLowerCase();
        return valA.localeCompare(valB);
      }
      const valA = String(a[field] || '').toLowerCase();
      const valB = String(b[field] || '').toLowerCase();
      return valA.localeCompare(valB);
    });
    const remapNumbers = sorted.map((ch, idx) => ({ ...ch, index: idx }));
    this.modifiedChannels.set(remapNumbers);
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

  private parseEntries(text: string): Array<{ line: number; index: number; payload: string }> {
    const lines = text.split(/\r?\n/);
    const entryRe = /^\s*stream_data\[(\d+)\]:\s*"([^"]*)"/;
    const entries: Array<{ line: number; index: number; payload: string }> = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(entryRe);
      if (m) entries.push({ line: i + 1, index: Number(m[1]), payload: m[2] });
    }
    return entries.sort((a, b) => a.index - b.index);
  }

  private validateEntry(payload: string) {
    const issues: string[] = [];
    if (!this.hasCorrectPipeCount(payload)) issues.push('PIPE_COUNT: expected 5 pipes (6 fields)');
    if (!this.hasNoWhitespaceAroundPipes(payload))
      issues.push('PIPE_WHITESPACE: whitespace around pipe');
    const parts = payload.split('|');
    if (parts.length >= 6) {
      const [url, name, , , bitrate, favorite] = parts;
      if (!url) issues.push('URL_EMPTY');
      if (!name) issues.push('NAME_EMPTY');
      if (!this.isValidBitrate(bitrate)) issues.push('BITRATE_INVALID');
      if (!this.isValidFavorite(favorite)) issues.push('FAVORITE_INVALID');
    }
    return { ok: issues.length === 0, issues, fieldsCount: parts.length };
  }

  private validateText(text: string) {
    const entries = this.parseEntries(text);
    const results = entries.map((e) => ({ e, v: this.validateEntry(e.payload) }));
    const invalid = results.filter((r) => !r.v.ok);
    return { ok: invalid.length === 0, entries, invalid };
  }

  onImport() {
    this.getImportedLivestreams().subscribe({
      error: (e) => console.error('Import failed', e),
      next: (channels) => {
        this.modifiedChannels.set(channels);
        this.editingFields.clear();
      },
    });
  }

  onImportFromEuroTruckSimulator() {
    this.getImportedLivestreamsFromEuroTruckSimulator().subscribe({
      error: (e) => console.error('Import failed', e),
      next: (channels) => {
        this.modifiedChannels.set(channels);
        this.editingFields.clear();
      },
    });
  }

  getImportedLivestreams() {
    return this.util.chooseImportFile().pipe(
      filter((p): p is string => !!p),
      switchMap((path) => this.util.readTextFile(path).pipe(map((text) => ({ path, text })))),
      map(({ path, text }) => ({ path, report: this.validateText(String(text ?? '')) })),
      tap(({ report }) => {
        if (!report.ok) {
          const formatInvalidPreview = (
            items: Array<{ e: { line: number; index: number }; v: { issues: string[] } }>
          ) =>
            items
              .slice(0, 5)
              .map((r) => `line ${r.e.line} idx ${r.e.index}: ${r.v.issues.join(', ')}`)
              .join('\n');

          const first = formatInvalidPreview(report.invalid);
          this.showAlert(
            `Invalid live_streams.sii format (\ninvalid entries: ${report.invalid.length}/${report.entries.length}\n)\n\nExamples:\n${first}`
          );
        }
      }),
      filter(({ report }) => report.ok),
      switchMap(({ path }) => this.util.importLiveStreamsFromPath(path, 'live_streams.sii'))
    );
  }

  getImportedLivestreamsFromEuroTruckSimulator() {
    return this.util.importLiveStreamsFromEuroTruckSimulator('live_streams.sii');
  }

  applyPendingEdits() {
    for (const [fieldKey, value] of this.editingFields.entries()) {
      const [indexStr, field] = fieldKey.split('-');
      const index = parseInt(indexStr);
      const channels = this.visibleChannels();
      const updatedChannels = channels.map((c) =>
        c.index === index ? { ...c, [field]: value } : c
      );
      this.modifiedChannels.set(updatedChannels);
    }

    this.editingFields.clear();
  }

  onSave() {
    this.applyPendingEdits();

    // Export with the current (possibly modified) channel data
    const currentChannels = this.visibleChannels();
    console.log('currentChannels.length', currentChannels.length);
    this.util
      .exportLiveStreamsWithDataToEuroTruckSimulator(currentChannels)
      .pipe(
        catchError(() => {
          console.error('exportLiveStreamsWithDataToEuroTruckSimulator');
          return this.util.exportLiveStreamsWithDataToAppData(currentChannels);
        }),
        catchError(() => {
          console.error('exportLiveStreamsWithDataToAppData');
          return this.util.exportLiveStreamsWithData(
            currentChannels,
            'live_streams.sii',
            'live_streams.sii'
          );
        })
      )
      .subscribe({
        next: (res) => {
          if (!res?.canceled) {
            this.originalChannels.set(currentChannels);
            this.modifiedChannels.set(null);
            console.log('Exported to', res.destPath);
          }
        },
        error: (e) => {
          console.error('Export failed', e);
          this.showAlert(`Export failed: ${e?.message || 'no e.message'}`);
        },
      });
  }

  getConfirm(message: string) {
    const confirmResult = confirm(message);

    this.util.refocusMainWindow();

    return confirmResult;
  }

  onExport() {
    if (this.hasChanges()) {
      const confirmExport = this.getConfirm(
        'You have unsaved changes. Do you want to export the data without your pending changes?'
      );

      if (!confirmExport) {
        return;
      }
    }

    // Export with the current (possibly modified) channel data
    const currentChannels = this.originalChannels();
    this.util
      .exportLiveStreamsWithData(currentChannels, 'live_streams.sii', 'live_streams.sii')
      .subscribe({
        next: (res) => {
          if (!res?.canceled) {
            console.log('Exported to', res.destPath);
            this.showAlert(`Successfully exported live_streams.sii to:\n${res.destPath}`);
          }
        },
        error: (e) => {
          console.error('Export failed', e);
          this.showAlert('Export failed. Please check the console for details.');
        },
      });
  }

  ngOnInit() {
    this.loading.set(true);
    this.getImportedLivestreamsFromEuroTruckSimulator()
      .pipe(
        catchError(() => {
          return this.util.findGameChannels('live_streams.sii');
        }),
        catchError(() => {
          return this.getImportedLivestreams();
        })
      )
      .subscribe({
        error: (e) => console.error('Import from Euro Truck Simulator failed', e),
        next: (channels) => {
          this.modifiedChannels.set(null);
          this.originalChannels.set(channels);
          this.editingFields.clear();
          this.loading.set(false);
          this.loaded.set(true);
        },
      });
  }
}
