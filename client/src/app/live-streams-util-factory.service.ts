import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

/** Search options compatible with findCurrentChannels in the Node util. */
export interface SearchOptions {
  query?: string;
  mode?: 'substring' | 'startswith' | 'regex' | 'fuzzy';
  fields?: string[];
  distance?: number;
  caseInsensitive?: boolean;
  ignoreDiacritics?: boolean;
}

export interface ChannelResult {
  total: number;
  filteredCount: number;
  channels: Array<{
    index: number;
    url: string;
    name: string;
    genre: string;
    lang: string;
    bitrate: string;
    favorite: string; // '0' | '1'
  }>;
}

/**
 * Lightweight wrapper around the Electron preload `window.api` surface.
 * Centralizes type-safety and makes it easy to mock/replace later.
 */
@Injectable({ providedIn: 'root' })
export class LiveStreamsUtilFactoryService {
  /** Default empty result for channels */
  private readonly emptyResult: ChannelResult = { total: 0, filteredCount: 0, channels: [] };

  /**
   * Find current channels parsed from live_streams.sii
   */
  findGameChannels(filePath = 'live_streams.sii', search?: string | SearchOptions): Observable<ChannelResult> {
    return from((window as any).api?.findGameChannels?.(filePath, search)).pipe(
      catchError(() => of(this.emptyResult))
    );
  }

  /**
   * Export an existing live_streams.sii to a user-selected directory.
   */
  exportLiveStreams(sourcePath = 'live_streams.sii', fileName = 'live_streams.sii'): Observable<{ canceled: boolean; destPath?: string }>{
    return from((window as any).api?.exportLiveStreams?.(sourcePath, fileName)).pipe(
      catchError(() => of({ canceled: true as const }))
    );
  }

  /** Open file picker for import (returns path or null). */
  chooseImportFile(): Observable<string | null> {
    return from((window as any).api?.chooseImportFile?.()).pipe(
      catchError(() => of(null))
    );
  }

  /** Read a UTF-8 file into a string. */
  readTextFile(filePath: string): Observable<string> {
    return from((window as any).api?.readTextFile?.(filePath)).pipe(
      catchError(() => of(''))
    );
  }

  /** Replace the target live_streams.sii with a chosen source path. */
  importLiveStreamsFromPath(srcPath: string, targetPath = 'live_streams.sii'): Observable<{ canceled: boolean; srcPath?: string; destPath?: string }>{
    return from((window as any).api?.importLiveStreamsFromPath?.(srcPath, targetPath)).pipe(
      catchError(() => of({ canceled: true as const }))
    );
  }
}
