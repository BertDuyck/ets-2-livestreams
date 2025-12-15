import { Injectable } from '@angular/core';

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
  /**
   * Find current channels parsed from live_streams.sii
   */
  findGameChannels(filePath = 'live_streams.sii', search?: string | SearchOptions): Promise<ChannelResult> {
    return (window as any).api?.findGameChannels?.(filePath, search);
  }

  /**
   * Export an existing live_streams.sii to a user-selected directory.
   */
  exportLiveStreams(sourcePath = 'live_streams.sii', fileName = 'live_streams.sii'): Promise<{ canceled: boolean; destPath?: string }>{
    return (window as any).api?.exportLiveStreams?.(sourcePath, fileName);
  }

  /** Open file picker for import (returns path or null). */
  chooseImportFile(): Promise<string | null> {
    return (window as any).api?.chooseImportFile?.();
  }

  /** Read a UTF-8 file into a string. */
  readTextFile(filePath: string): Promise<string> {
    return (window as any).api?.readTextFile?.(filePath);
  }

  /** Replace the target live_streams.sii with a chosen source path. */
  importLiveStreamsFromPath(srcPath: string, targetPath = 'live_streams.sii'): Promise<{ canceled: boolean; srcPath?: string; destPath?: string }>{
    return (window as any).api?.importLiveStreamsFromPath?.(srcPath, targetPath);
  }
}
