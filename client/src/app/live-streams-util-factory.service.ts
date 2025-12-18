import { Injectable } from '@angular/core';
import { Observable, defer, from, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

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
  channels: Channel[];
}

/**
 * Lightweight wrapper around the Electron preload `window.api` surface.
 * Centralizes type-safety and makes it easy to mock/replace later.
 */
@Injectable({ providedIn: 'root' })
export class LiveStreamsUtilFactoryService {
  /** Default empty result for channels */
  private readonly emptyResult: ChannelResult = { total: 0, filteredCount: 0, channels: [] };

  getRandomUuid(): string {
    return (window as any).api.getRandomUuid()
  }

  /**
   * Find current channels parsed from live_streams.sii
   */
  findGameChannels(filePath = 'live_streams.sii', search?: string | SearchOptions): Observable<Channel[]> {
    return defer(() => (window as any).api.findGameChannels(filePath, search) as Promise<ChannelResult>).pipe(
      map(res => JSON.parse(JSON.stringify(res?.channels ?? []))),
      // catchError(() => of<ChannelResult>({ total: 0, filteredCount: 0, channels: [] }))
    );
  }

    /**
   * Export an existing live_streams.sii to a user-selected directory.
   */
  exportLiveStreams(sourcePath = 'live_streams.sii', fileName = 'live_streams.sii'): Observable<{ canceled: boolean; destPath?: string }>{
    return from((window as any).api?.exportLiveStreams?.(sourcePath, fileName) as Promise<{ canceled: boolean; destPath?: string }>).pipe(
      catchError(() => of({ canceled: true as const }))
    );
  }

  /**
   * Export live_streams.sii with updated channel data (e.g., modified favorites)
   */
  exportLiveStreamsWithData(
    channels: Array<{
      index: number;
      url: string;
      name: string;
      genre: string;
      lang: string;
      bitrate: string;
      favorite: string;
    }>,
    sourcePath = 'live_streams.sii',
    fileName = 'live_streams.sii'
  ): Observable<{ canceled: boolean; destPath?: string }> {
    return from((window as any).api?.exportLiveStreamsWithData?.(channels, sourcePath, fileName) as Promise<{ canceled: boolean; destPath?: string }>).pipe(
      // catchError(() => of({ canceled: true as const }))
    );
  }

  exportLiveStreamsWithDataToEuroTruckSimulator(channels: Array<{
      index: number;
      url: string;
      name: string;
      genre: string;
      lang: string;
      bitrate: string;
      favorite: string;
    }>): Observable<{ canceled: boolean; destPath?: string }> {
    return from((window as any).api?.exportLiveStreamsWithDataToEuroTruckSimulator?.(channels) as Promise<{ canceled: boolean; destPath?: string }>).pipe(
      // catchError(() => of({ canceled: true as const }))
    );
  }

  exportLiveStreamsWithDataToAppData(channels: Array<{
      index: number;
      url: string;
      name: string;
      genre: string;
      lang: string;
      bitrate: string;
      favorite: string;
    }>): Observable<{ canceled: boolean; destPath?: string }> {
    return from((window as any).api?.exportLiveStreamsWithDataToAppData?.(channels) as Promise<{ canceled: boolean; destPath?: string }>).pipe(
      // catchError(() => of({ canceled: true as const }))
    );
  }

  refocusMainWindow(): void {
    (window as any).api?.refocusMainWindow?.();
  }

  /** Open file picker for import (returns path or null). */
  chooseImportFile(): Observable<string | null> {
    return from((window as any).api?.chooseImportFile?.() as Promise<string>).pipe(
      catchError(() => of(null))
    );
  }

  /** Read a UTF-8 file into a string. */
  readTextFile(filePath: string): Observable<string> {
    return from((window as any).api?.readTextFile?.(filePath) as Promise<string>).pipe(
      catchError(() => of(''))
    );
  }

  importLiveStreamsFromEuroTruckSimulator(targetPath = 'live_streams.sii'): Observable<Channel[]>{
    return defer(() => (window as any).api?.importLiveStreamsFromEuroTruckSimulator?.(targetPath) as Promise<ChannelResult>).pipe(
      map(res => res?.channels),
      // switchMap(() => this.findGameChannels('live_streams.sii')),
      // catchError(() => of({ canceled: true as const }))
    );
  }

    /** Replace the target live_streams.sii with a chosen source path. */
  importLiveStreamsFromPath(srcPath: string, targetPath = 'live_streams.sii'): Observable<Channel[]>{
    return from((window as any).api?.importLiveStreamsFromPath?.(srcPath, targetPath) as Promise<ChannelResult>).pipe(
      map(res => res?.channels),
      // catchError(() => of({ canceled: true as const }))
      // switchMap(() => this.findGameChannels('live_streams.sii')),
    );
  }

  /**
   * Save updated channel data to the original file (overwrite)
   */
  saveLiveStreamsData(
    channels: Array<{
      index: number;
      url: string;
      name: string;
      genre: string;
      lang: string;
      bitrate: string;
      favorite: string;
    }>,
    targetPath = 'live_streams.sii'
  ): Observable<{ success: boolean; error?: string }> {
    return from((window as any).api?.saveLiveStreamsData?.(channels, targetPath) as Promise<{ success: boolean; error?: string }>).pipe(
      catchError((error) => of({ success: false, error: error?.message || 'Save failed' }))
    );
  }
}
