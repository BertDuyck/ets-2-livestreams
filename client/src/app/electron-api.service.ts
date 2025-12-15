// Lightweight Angular service wrapping the Electron preload API.
// No providedIn to avoid tree-shaking; you can register it in a component or root later.

export type PublicStation = {
  url: string; name: string; genre: string; lang?: string; bitrate?: string; favorite?: '0'|'1';
  favicon?: string; homepage?: string; country?: string;
};

declare global {
  interface Window {
    api?: {
      fetchPublicStations(filters?: { name?: string; tag?: string; country?: string; language?: string; limit?: number }): Promise<PublicStation[]>;
      findGameChannels(filePath?: string, search?: any): Promise<{ total:number; filteredCount:number; channels:any[] }>;
      markFavorite(filePath: string, indexOrIndexes: number|number[], setFavorite?: boolean): Promise<void>;
    };
  }
}

export class ElectronApiService {
  fetchPublicStations(filters?: Parameters<NonNullable<Window['api']>['fetchPublicStations']>[0]) {
    return window.api?.fetchPublicStations(filters) ?? Promise.resolve([]);
  }
  findGameChannels(filePath?: string, search?: any) {
    return window.api?.findGameChannels(filePath, search) ?? Promise.resolve({ total: 0, filteredCount: 0, channels: [] });
  }
  markFavorite(filePath: string, indexOrIndexes: number|number[], setFavorite = true) {
    return window.api?.markFavorite(filePath, indexOrIndexes, setFavorite) ?? Promise.resolve();
  }
}
