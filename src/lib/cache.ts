import type {
  ContinueWatchingItem,
  Library,
  LibraryFacets,
  MediaItemDetail,
  MediaItemSummary,
  NextUpItem,
  SeriesDetail,
  SeriesSummary,
  SimilarMediaResponse,
} from './api';

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
  epoch: number;
}

export interface HomeData {
  continueItems: ContinueWatchingItem[];
  nextUpItems: NextUpItem[];
  watchlistItems: MediaItemSummary[];
  homeShelves: {
    library: Library;
    series: SeriesSummary[];
    items: MediaItemSummary[];
  }[];
}

export interface MyListData {
  watchlistItems: MediaItemSummary[];
  favoriteItems: MediaItemSummary[];
}

export interface GridViewData {
  series: SeriesSummary[];
  items: MediaItemSummary[];
  favorites?: MediaItemSummary[];
}

const DEFAULT_FRESH_MS = 30_000;
const MAX_CACHE_ENTRIES = 80;

let catalogEpoch = 1;

function putBounded<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): void {
  if (map.has(key)) {
    map.delete(key);
  } else if (map.size >= MAX_CACHE_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, { value, fetchedAt: Date.now(), epoch: catalogEpoch });
}

function getEntry<T>(map: Map<string, CacheEntry<T>>, key: string): CacheEntry<T> | undefined {
  return map.get(key);
}

function isFresh<T>(entry: CacheEntry<T> | undefined, freshMs = DEFAULT_FRESH_MS): boolean {
  if (!entry) return false;
  if (entry.epoch !== catalogEpoch) return false;
  return Date.now() - entry.fetchedAt < freshMs;
}

let librariesCache: CacheEntry<Library[]> | undefined;
let homeCache: CacheEntry<HomeData> | undefined;
let myListCache: CacheEntry<MyListData> | undefined;
const libraryFacetsCache = new Map<string, CacheEntry<LibraryFacets>>();
const gridCache = new Map<string, CacheEntry<GridViewData>>();
const itemDetailCache = new Map<string, CacheEntry<MediaItemDetail>>();
const itemSimilarCache = new Map<string, CacheEntry<SimilarMediaResponse>>();
const seriesDetailCache = new Map<string, CacheEntry<SeriesDetail>>();

export function seriesCacheKey(libraryId: string, title: string): string {
  return `${libraryId}:${title.toLowerCase()}`;
}

/**
 * Marks all cached views stale without evicting them, so Back/Forward navigation
 * still renders immediately on frame 0 while revalidating silently in the background.
 */
export function invalidateCatalogCache(): void {
  catalogEpoch += 1;
}

/** Completely clears all caches (call on sign-out). */
export function clearAllCaches(): void {
  catalogEpoch += 1;
  librariesCache = undefined;
  homeCache = undefined;
  myListCache = undefined;
  libraryFacetsCache.clear();
  gridCache.clear();
  itemDetailCache.clear();
  itemSimilarCache.clear();
  seriesDetailCache.clear();
}

export const viewCache = {
  getLibraries(): Library[] | undefined {
    return librariesCache?.value;
  },
  isLibrariesFresh(freshMs = 60_000): boolean {
    return isFresh(librariesCache, freshMs);
  },
  setLibraries(libs: Library[]): void {
    librariesCache = { value: libs, fetchedAt: Date.now(), epoch: catalogEpoch };
  },

  getHome(): HomeData | undefined {
    return homeCache?.value;
  },
  isHomeFresh(freshMs = DEFAULT_FRESH_MS): boolean {
    return isFresh(homeCache, freshMs);
  },
  setHome(data: HomeData): void {
    homeCache = { value: data, fetchedAt: Date.now(), epoch: catalogEpoch };
  },

  getMyList(): MyListData | undefined {
    return myListCache?.value;
  },
  isMyListFresh(freshMs = DEFAULT_FRESH_MS): boolean {
    return isFresh(myListCache, freshMs);
  },
  setMyList(data: MyListData): void {
    myListCache = { value: data, fetchedAt: Date.now(), epoch: catalogEpoch };
  },

  getLibraryFacets(libraryId: string): LibraryFacets | undefined {
    return getEntry(libraryFacetsCache, libraryId)?.value;
  },
  isLibraryFacetsFresh(libraryId: string, freshMs = 60_000): boolean {
    return isFresh(getEntry(libraryFacetsCache, libraryId), freshMs);
  },
  setLibraryFacets(libraryId: string, facets: LibraryFacets): void {
    putBounded(libraryFacetsCache, libraryId, facets);
  },

  getGrid(key: string): GridViewData | undefined {
    return getEntry(gridCache, key)?.value;
  },
  isGridFresh(key: string, freshMs = DEFAULT_FRESH_MS): boolean {
    return isFresh(getEntry(gridCache, key), freshMs);
  },
  setGrid(key: string, data: GridViewData): void {
    putBounded(gridCache, key, data);
  },

  getItemDetail(itemId: string): MediaItemDetail | undefined {
    return getEntry(itemDetailCache, itemId)?.value;
  },
  isItemDetailFresh(itemId: string, freshMs = DEFAULT_FRESH_MS): boolean {
    return isFresh(getEntry(itemDetailCache, itemId), freshMs);
  },
  setItemDetail(itemId: string, detail: MediaItemDetail): void {
    putBounded(itemDetailCache, itemId, detail);
  },

  getItemSimilar(itemId: string): SimilarMediaResponse | undefined {
    return getEntry(itemSimilarCache, itemId)?.value;
  },
  isItemSimilarFresh(itemId: string, freshMs = 120_000): boolean {
    return isFresh(getEntry(itemSimilarCache, itemId), freshMs);
  },
  setItemSimilar(itemId: string, res: SimilarMediaResponse): void {
    putBounded(itemSimilarCache, itemId, res);
  },

  getSeriesDetail(libraryId: string, title: string): SeriesDetail | undefined {
    return getEntry(seriesDetailCache, seriesCacheKey(libraryId, title))?.value;
  },
  isSeriesDetailFresh(libraryId: string, title: string, freshMs = DEFAULT_FRESH_MS): boolean {
    return isFresh(getEntry(seriesDetailCache, seriesCacheKey(libraryId, title)), freshMs);
  },
  setSeriesDetail(libraryId: string, title: string, detail: SeriesDetail): void {
    putBounded(seriesDetailCache, seriesCacheKey(libraryId, title), detail);
  },
};
