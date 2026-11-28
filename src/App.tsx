import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LogOut,
  Search,
  Home,
  Film,
  Tv,
  Sparkles,
  Music,
  FolderOpen,
  Settings2,
  Smartphone,
  ChevronRight,
  ArrowLeft,
  SlidersHorizontal,
  Bookmark,
  Heart,
  Inbox,
  LayoutGrid,
  List,
  Menu,
  X,
} from 'lucide-react';
import { useTheme } from './lib/theme';
import { LuneMark } from './components/LuneMark';
import { AppLink, libraryPath } from './components/AppLink';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import {
  api,
  type ContinueWatchingItem,
  type DiscoverFilter,
  type DiscoverFilterKind,
  type Library,
  type LibraryFacets,
  type LibraryFilters,
  type MediaItemSummary,
  type NextUpItem,
  type PlaybackLaunchOptions,
  type PlaybackProgress,
  type SeriesSummary,
  type SortOption,
  type SystemInfo,
  type User,
} from './lib/api';
import { clearAllCaches, invalidateCatalogCache, viewCache } from './lib/cache';
import { PosterBadgesContext } from './lib/posterBadges';
import { AuthScreen } from './components/AuthScreen';
import { TotpEnrollmentScreen } from './components/TotpEnrollmentScreen';
import { MediaCard } from './components/MediaCard';
import { SeriesCard } from './components/SeriesCard';
import { MediaListRow, SeriesListRow } from './components/MediaListRow';
import { LibraryFilterBar, countActiveFilters } from './components/LibraryFilterBar';
import { MediaShelf, SHELF_CARD_CLASS } from './components/MediaShelf';
import { ItemDetailPage } from './components/ItemDetailPage';
import { SeriesDetailPage } from './components/SeriesDetailPage';
import { TheaterPlayer } from './components/TheaterPlayer';
import { AdminConsole, type ConsoleSection } from './components/AdminConsole';
import { DevicePair } from './components/DevicePair';
import { PreferencesModal } from './components/PreferencesModal';
import { RequestsPage } from './components/RequestsPage';

type View =
  | { kind: 'home' }
  | { kind: 'mylist'; tab: 'watchlist' | 'favorites' }
  | { kind: 'requests' }
  | { kind: 'library'; libraryId: string }
  | { kind: 'recent'; libraryId: string }
  | { kind: 'discover'; filterKind: DiscoverFilterKind; value: string }
  | { kind: 'pair' }
  | { kind: 'console'; section: ConsoleSection }
  | { kind: 'series'; libraryId: string; title: string; initialSeries?: SeriesSummary }
  | { kind: 'item'; itemId: string; initialItem?: MediaItemSummary }
  | { kind: 'watch'; itemId: string; initialItem?: MediaItemSummary; launchOptions?: PlaybackLaunchOptions };

const VALID_DISCOVER_KINDS = new Set<DiscoverFilterKind>(['genre', 'person', 'studio']);

const VALID_CONSOLE_SECTIONS = new Set<ConsoleSection>([
  'overview',
  'libraries',
  'requests',
  'users',
  'invites',
  'playback',
  'network',
  'maintenance',
  'activity',
]);

function extractInviteToken(pathname: string): string | undefined {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts[0] === 'invite' && parts[1]) {
    return decodeURIComponent(parts[1]);
  }
  return undefined;
}

interface HomeShelf {
  library: Library;
  series: SeriesSummary[];
  items: MediaItemSummary[];
}

function viewToPath(v: View): string {
  switch (v.kind) {
    case 'home':
      return '/';
    case 'mylist':
      return v.tab === 'favorites' ? '/my-list/favorites' : '/my-list';
    case 'requests':
      return '/requests';
    case 'library':
      return `/libraries/${encodeURIComponent(v.libraryId)}`;
    case 'recent':
      return `/libraries/${encodeURIComponent(v.libraryId)}/recent`;
    case 'discover':
      return `/discover/${encodeURIComponent(v.filterKind)}/${encodeURIComponent(v.value)}`;
    case 'series':
      return `/series/${encodeURIComponent(v.libraryId)}/${encodeURIComponent(v.title)}`;
    case 'item':
      return `/items/${encodeURIComponent(v.itemId)}`;
    case 'watch':
      return `/watch/${encodeURIComponent(v.itemId)}`;
    case 'pair':
      return '/pair';
    case 'console':
      return v.section === 'overview' ? '/console' : `/console/${v.section}`;
  }
}

function pathToView(pathname: string): View {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/') return { kind: 'home' };
  if (clean === '/my-list') return { kind: 'mylist', tab: 'watchlist' };
  if (clean === '/my-list/favorites' || clean === '/favorites') {
    return { kind: 'mylist', tab: 'favorites' };
  }
  if (clean === '/requests') return { kind: 'requests' };
  if (clean === '/pair') return { kind: 'pair' };
  if (clean === '/console') return { kind: 'console', section: 'overview' };

  const parts = clean.split('/').filter(Boolean);
  if (parts[0] === 'console') {
    const sec = (parts[1] ?? 'overview') as ConsoleSection;
    return {
      kind: 'console',
      section: VALID_CONSOLE_SECTIONS.has(sec) ? sec : 'overview',
    };
  }
  if (parts[0] === 'libraries' && parts[1]) {
    if (parts[2] === 'recent') {
      return { kind: 'recent', libraryId: decodeURIComponent(parts[1]) };
    }
    return { kind: 'library', libraryId: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === 'discover' && parts[1] && parts[2]) {
    const fk = decodeURIComponent(parts[1]) as DiscoverFilterKind;
    if (VALID_DISCOVER_KINDS.has(fk)) {
      return {
        kind: 'discover',
        filterKind: fk,
        value: decodeURIComponent(parts.slice(2).join('/')),
      };
    }
  }
  if (parts[0] === 'series' && parts[1] && parts[2]) {
    return {
      kind: 'series',
      libraryId: decodeURIComponent(parts[1]),
      title: decodeURIComponent(parts.slice(2).join('/')),
    };
  }
  if (parts[0] === 'items' && parts[1]) {
    return { kind: 'item', itemId: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === 'watch' && parts[1]) {
    return { kind: 'watch', itemId: decodeURIComponent(parts[1]) };
  }
  return { kind: 'home' };
}

function LibraryIcon({ kind, className = 'w-3.5 h-3.5' }: { kind: Library['kind']; className?: string }) {
  switch (kind) {
    case 'movies':
      return <Film className={className} />;
    case 'shows':
      return <Tv className={className} />;
    case 'anime':
      return <Sparkles className={className} />;
    case 'music':
      return <Music className={className} />;
    default:
      return <FolderOpen className={className} />;
  }
}

type ViewMode = 'poster' | 'list';

function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (next: ViewMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="View mode"
      className="inline-flex items-center rounded-lg bg-surface border border-hairline p-0.5"
    >
      <button
        type="button"
        title="Poster view"
        aria-label="Poster view"
        aria-pressed={mode === 'poster'}
        onClick={() => onChange('poster')}
        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
          mode === 'poster'
            ? 'bg-tone/12 text-ink'
            : 'text-ink-secondary hover:text-ink'
        }`}
      >
        <LayoutGrid className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        title="List view"
        aria-label="List view"
        aria-pressed={mode === 'list'}
        onClick={() => onChange('list')}
        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
          mode === 'list'
            ? 'bg-tone/12 text-ink'
            : 'text-ink-secondary hover:text-ink'
        }`}
      >
        <List className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function serializeFilters(filters: LibraryFilters): string {
  const parts: string[] = [];
  if (filters.genre) parts.push(`g=${filters.genre}`);
  if (filters.content_rating) parts.push(`cr=${filters.content_rating}`);
  if (filters.min_rating) parts.push(`mr=${filters.min_rating}`);
  if (filters.year) parts.push(`y=${filters.year}`);
  if (filters.decade) parts.push(`d=${filters.decade}`);
  if (filters.resolution) parts.push(`r=${filters.resolution}`);
  if (filters.hdr) parts.push('hdr=1');
  if (filters.dual_audio) parts.push('da=1');
  if (filters.watched) parts.push(`w=${filters.watched}`);
  return parts.join('&');
}

function gridKeyFor(v: View, search: string, sort: SortOption, filters: LibraryFilters): string | null {
  const q = search.trim();
  if (q !== '' && (v.kind === 'home' || v.kind === 'library')) {
    return `search:${v.kind === 'library' ? v.libraryId : 'all'}:${sort}:${q}`;
  }
  switch (v.kind) {
    case 'library': {
      const fk = serializeFilters(filters);
      return `library:${v.libraryId}:${sort}${fk ? `:${fk}` : ''}`;
    }
    case 'recent':
      return `recent:${v.libraryId}`;
    case 'discover':
      return `discover:${v.filterKind}:${v.value}:${sort}`;
    default:
      return null;
  }
}

/** Page size for infinitely scrolled library/discover item grids (server max is 200). */
const GRID_PAGE_SIZE = 120;

type ListItemsParams = NonNullable<Parameters<typeof api.listItems>[0]>;

/**
 * Query behind a paginated item grid (Library or Discover), or null when the view has no
 * paginated `/api/v1/items` grid (e.g. a `shows` library, which lists series only).
 * Anime libraries ask for `kind: 'movie'` so episodes don't consume the page budget.
 */
function pagedItemsQuery(
  v: View,
  filters: LibraryFilters,
  sort: SortOption,
  libs: Library[],
): ListItemsParams | null {
  if (v.kind === 'discover') {
    const fp =
      v.filterKind === 'genre'
        ? { genre: v.value }
        : v.filterKind === 'studio'
          ? { studio: v.value }
          : { person: v.value };
    return { ...fp, sort };
  }
  if (v.kind === 'library') {
    const lib = libs.find((l) => l.id === v.libraryId);
    if (lib?.kind === 'shows') return null;
    return {
      library_id: v.libraryId,
      ...(lib?.kind === 'anime' ? { kind: 'movie' } : {}),
      ...filters,
      sort,
    };
  }
  return null;
}

/** Appends a fetched page, dropping episodes and any rows already present (offset drift on concurrent scans). */
function appendGridItems(prev: MediaItemSummary[], page: MediaItemSummary[]): MediaItemSummary[] {
  const seen = new Set(prev.map((m) => m.id));
  const next = prev.slice();
  for (const m of page) {
    if (m.kind === 'episode' || seen.has(m.id)) continue;
    seen.add(m.id);
    next.push(m);
  }
  return next;
}

interface LuneHistoryState {
  lune?: boolean;
  entryId?: number;
  prevPath?: string;
}

export function App() {
  useTheme();
  const [booting, setBooting] = useState(true);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const [view, setView] = useState<View>(() => pathToView(window.location.pathname));
  const [inviteToken, setInviteToken] = useState<string | undefined>(() =>
    extractInviteToken(window.location.pathname),
  );
  const [historyDepth, setHistoryDepth] = useState(0);
  const [libraries, setLibraries] = useState<Library[]>(() => viewCache.getLibraries() ?? []);
  const librariesRef = useRef<Library[]>(libraries);
  librariesRef.current = libraries;

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('title');
  const [filters, setFilters] = useState<LibraryFilters>({});
  const [facetsState, setFacetsState] = useState<{
    libraryId: string;
    facets: LibraryFacets | null;
  }>({ libraryId: '', facets: null });
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    try {
      return window.localStorage.getItem('lune_view_mode') === 'list' ? 'list' : 'poster';
    } catch {
      return 'poster';
    }
  });
  const setViewMode = useCallback((next: ViewMode) => {
    setViewModeState(next);
    try {
      window.localStorage.setItem('lune_view_mode', next);
    } catch {
      // ignore storage errors
    }
  }, []);

  // Home & personal lists state (hydrated from cache when available)
  const [continueItems, setContinueItems] = useState<ContinueWatchingItem[]>(
    () => viewCache.getHome()?.continueItems ?? [],
  );
  const [nextUpItems, setNextUpItems] = useState<NextUpItem[]>(
    () => viewCache.getHome()?.nextUpItems ?? [],
  );
  const [watchlistItems, setWatchlistItems] = useState<MediaItemSummary[]>(
    () => viewCache.getMyList()?.watchlistItems ?? viewCache.getHome()?.watchlistItems ?? [],
  );
  const [favoriteItems, setFavoriteItems] = useState<MediaItemSummary[]>(
    () => viewCache.getMyList()?.favoriteItems ?? [],
  );
  const [homeShelves, setHomeShelves] = useState<HomeShelf[]>(
    () => viewCache.getHome()?.homeShelves ?? [],
  );
  const [homeLoading, setHomeLoading] = useState(false);

  // Per-view keyed grid state so Back/Forward never flashes another view's items
  const [gridState, setGridState] = useState<{
    key: string;
    series: SeriesSummary[];
    items: MediaItemSummary[];
    /** Server `total` for the paginated item query; undefined for unpaginated grids. */
    itemsTotal?: number;
    /** Raw rows fetched so far, used as the next page's `offset`. */
    itemsOffset?: number;
  }>({ key: '', series: [], items: [] });
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const loadMoreInFlightRef = useRef<string | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const [animeFilter, setAnimeFilter] = useState<'all' | 'series' | 'movies'>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (mobileSearchOpen) {
      mobileSearchInputRef.current?.focus();
    }
  }, [mobileSearchOpen]);

  // Per-history-entry scroll position map for instant Back/Forward restoration
  const scrollPositionsRef = useRef<Map<number, number>>(new Map());
  const nextEntryIdRef = useRef(2);
  const currentEntryIdRef = useRef(1);

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    const existing = (window.history.state as LuneHistoryState | null) ?? {};
    const entryId = typeof existing.entryId === 'number' ? existing.entryId : 1;
    currentEntryIdRef.current = entryId;
    if (entryId >= nextEntryIdRef.current) {
      nextEntryIdRef.current = entryId + 1;
    }
    if (existing.entryId !== entryId) {
      window.history.replaceState({ ...existing, lune: true, entryId }, '');
    }
  }, []);

  // Real browser History API navigation so Back/Forward, trackpad swipe, and refresh work natively.
  const navigateTo = useCallback((nextView: View) => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    const nextPath = viewToPath(nextView);
    const currentPath = window.location.pathname;
    scrollPositionsRef.current.set(currentEntryIdRef.current, window.scrollY);
    if (currentPath !== nextPath) {
      const nextEntryId = nextEntryIdRef.current++;
      window.history.pushState(
        { lune: true, entryId: nextEntryId, prevPath: currentPath } satisfies LuneHistoryState,
        '',
        nextPath,
      );
      currentEntryIdRef.current = nextEntryId;
      setHistoryDepth((d) => d + 1);
    }
    setSearch('');
    setMobileSearchOpen(false);
    setMobileMenuOpen(false);
    setAnimeFilter('all');
    setFavoritesOnly(false);
    setFilters({});
    setView(nextView);
    window.scrollTo(0, 0);
  }, []);

  const startPlayback = useCallback(
    (item: MediaItemSummary, opts?: PlaybackLaunchOptions) => {
      navigateTo({ kind: 'watch', itemId: item.id, initialItem: item, launchOptions: opts });
    },
    [navigateTo],
  );

  const goBack = useCallback(
    (fallback: View = { kind: 'home' }) => {
      if (historyDepth > 0) {
        scrollPositionsRef.current.set(currentEntryIdRef.current, window.scrollY);
        window.history.back();
        return;
      }
      navigateTo(fallback);
    },
    [historyDepth, navigateTo],
  );

  // Navigate up to a parent view (e.g. Episode -> Series): pop history when the previous entry
  // is already that parent, otherwise replace the current entry so Back on the parent returns
  // to where the user originally came from (Home, Library, Watchlist) instead of looping back
  // into the episode.
  const goToTargetOrBack = useCallback(
    (target: View) => {
      const normalize = (p: string) => p.replace(/\/+$/, '') || '/';
      const state = window.history.state as LuneHistoryState | null;
      const prevPath = state?.prevPath;
      const targetPath = viewToPath(target);
      scrollPositionsRef.current.set(currentEntryIdRef.current, window.scrollY);
      if (historyDepth > 0 && prevPath && normalize(prevPath) === normalize(targetPath)) {
        window.history.back();
        return;
      }
      window.history.replaceState(
        { lune: true, entryId: currentEntryIdRef.current, prevPath } satisfies LuneHistoryState,
        '',
        targetPath,
      );
      setSearch('');
      setAnimeFilter('all');
      setFavoritesOnly(false);
      setFilters({});
      setView(target);
      window.scrollTo(0, 0);
    },
    [historyDepth],
  );

  // Sync view when user clicks browser Back/Forward or swipes back.
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      scrollPositionsRef.current.set(currentEntryIdRef.current, window.scrollY);
      const state = (e.state ?? window.history.state) as LuneHistoryState | null;
      let targetEntryId = typeof state?.entryId === 'number' ? state.entryId : undefined;
      if (targetEntryId === undefined) {
        targetEntryId = nextEntryIdRef.current++;
      } else if (targetEntryId >= nextEntryIdRef.current) {
        nextEntryIdRef.current = targetEntryId + 1;
      }
      currentEntryIdRef.current = targetEntryId;

      setSearch('');
      setFilters({});
      setHistoryDepth((d) => Math.max(0, d - 1));
      setInviteToken(extractInviteToken(window.location.pathname));
      setView(pathToView(window.location.pathname));

      const savedY = scrollPositionsRef.current.get(targetEntryId) ?? 0;
      window.requestAnimationFrame(() => {
        window.scrollTo(0, savedY);
      });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const info = await api.getSystemInfo();
      setSystemInfo(info);
      if (!info.setup_required) {
        try {
          const me = await api.getMe();
          setUser(me.user);
        } catch {
          setUser(null);
        }
      }
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const loadData = useCallback(
    async (opts?: { force?: boolean; signal?: AbortSignal }) => {
      if (!user || (user.totp_required && !user.totp_enabled)) return;
      const force = opts?.force ?? false;
      const signal = opts?.signal;

      // Avoid blocking every navigation behind /api/v1/libraries when libraries are already loaded.
      let libs = librariesRef.current;
      const needsBlockingLibs = force || libs.length === 0;
      if (needsBlockingLibs) {
        const libsRes = await api.listLibraries(signal).catch(() => null);
        if (signal?.aborted) return;
        if (libsRes) {
          libs = libsRes.libraries;
          viewCache.setLibraries(libs);
          setLibraries(libs);
        }
      } else if (!viewCache.isLibrariesFresh()) {
        api
          .listLibraries(signal)
          .then((res) => {
            if (signal?.aborted) return;
            viewCache.setLibraries(res.libraries);
            setLibraries(res.libraries);
          })
          .catch(() => {});
      }

      if (
        (view.kind === 'library' || view.kind === 'recent') &&
        libs.length > 0 &&
        !libs.some((l) => l.id === view.libraryId)
      ) {
        navigateTo({ kind: 'home' });
        return;
      }

      // Detail, watch, requests & pairing views fetch their own data; don't run unnecessary catalog fetches here.
      if (
        view.kind === 'item' ||
        view.kind === 'series' ||
        view.kind === 'watch' ||
        view.kind === 'pair' ||
        view.kind === 'console' ||
        view.kind === 'requests'
      ) {
        return;
      }

      const q = search.trim();
      const gKey = gridKeyFor(view, search, sort, filters);

      if (q !== '' && (view.kind === 'home' || view.kind === 'library') && gKey) {
        if (!force && viewCache.isGridFresh(gKey)) {
          const cached = viewCache.getGrid(gKey);
          if (cached) setGridState({ key: gKey, series: cached.series, items: cached.items });
          return;
        }
        const libFilter = view.kind === 'library' ? view.libraryId : undefined;
        const [sRes, iRes] = await Promise.all([
          api.listSeries({ library_id: libFilter, q, sort }, signal).catch(() => null),
          api.listItems({ library_id: libFilter, q, sort, limit: 80 }, signal).catch(() => null),
        ]);
        if (signal?.aborted || !sRes || !iRes) return;
        const items = iRes.items.filter((m) => m.kind !== 'episode');
        viewCache.setGrid(gKey, { series: sRes.series, items });
        setGridState({ key: gKey, series: sRes.series, items });
        return;
      }

      if (view.kind === 'home') {
        if (!force && viewCache.isHomeFresh()) {
          const cached = viewCache.getHome();
          if (cached) {
            setContinueItems(cached.continueItems);
            setNextUpItems(cached.nextUpItems ?? []);
            setWatchlistItems(cached.watchlistItems);
            setHomeShelves(cached.homeShelves);
          }
          setHomeLoading(false);
          return;
        }
        setHomeLoading(true);
        try {
          const [cwRes, nuRes, wlRes, shelves] = await Promise.all([
            api.getContinueWatching(signal).catch(() => ({ items: [] })),
            api.getNextUp(20, signal).catch(() => ({ items: [] })),
            api.listWatchlist(30, signal).catch(() => ({ items: [], total: 0 })),
            Promise.all(
              libs.map(async (lib): Promise<HomeShelf> => {
                if (lib.kind === 'shows') {
                  const sRes = await api
                    .listSeries({ library_id: lib.id, sort: 'recent' }, signal)
                    .catch(() => ({ series: [] }));
                  return { library: lib, series: sRes.series.slice(0, 15), items: [] };
                }
                if (lib.kind === 'anime') {
                  const [sRes, iRes] = await Promise.all([
                    api.listSeries({ library_id: lib.id, sort: 'recent' }, signal).catch(() => ({ series: [] })),
                    api
                      .listItems({ library_id: lib.id, kind: 'movie', sort: 'recent', limit: 15 }, signal)
                      .catch(() => ({ items: [], total: 0 })),
                  ]);
                  return {
                    library: lib,
                    series: sRes.series.slice(0, 15),
                    items: iRes.items.slice(0, 15),
                  };
                }
                const iRes = await api
                  .listItems({ library_id: lib.id, sort: 'recent', limit: 15 }, signal)
                  .catch(() => ({ items: [], total: 0 }));
                return {
                  library: lib,
                  series: [],
                  items: iRes.items.filter((m) => m.kind !== 'episode'),
                };
              }),
            ),
          ]);
          if (signal?.aborted) return;
          viewCache.setHome({
            continueItems: cwRes.items,
            nextUpItems: nuRes.items,
            watchlistItems: wlRes.items,
            homeShelves: shelves,
          });
          setContinueItems(cwRes.items);
          setNextUpItems(nuRes.items);
          setWatchlistItems(wlRes.items);
          setHomeShelves(shelves);
        } finally {
          if (!signal?.aborted) setHomeLoading(false);
        }
        return;
      }

      if (view.kind === 'mylist') {
        if (!force && viewCache.isMyListFresh()) {
          const cached = viewCache.getMyList();
          if (cached) {
            setWatchlistItems(cached.watchlistItems);
            setFavoriteItems(cached.favoriteItems);
          }
          return;
        }
        const [wlRes, favRes] = await Promise.all([
          api.listWatchlist(200, signal).catch(() => ({ items: [], total: 0 })),
          api.listFavorites(200, signal).catch(() => ({ items: [], total: 0 })),
        ]);
        if (signal?.aborted) return;
        viewCache.setMyList({ watchlistItems: wlRes.items, favoriteItems: favRes.items });
        setWatchlistItems(wlRes.items);
        setFavoriteItems(favRes.items);
        return;
      }

      if (view.kind === 'recent' && gKey) {
        if (!force && viewCache.isGridFresh(gKey)) {
          const cached = viewCache.getGrid(gKey);
          if (cached) setGridState({ key: gKey, series: cached.series, items: cached.items });
          return;
        }
        const recentLibObj = libs.find((l) => l.id === view.libraryId);
        let series: SeriesSummary[] = [];
        let items: MediaItemSummary[] = [];
        if (recentLibObj?.kind === 'shows') {
          const sRes = await api
            .listSeries({ library_id: view.libraryId, sort: 'recent' }, signal)
            .catch(() => ({ series: [] }));
          series = sRes.series.slice(0, 30);
        } else if (recentLibObj?.kind === 'anime') {
          const [sRes, iRes] = await Promise.all([
            api.listSeries({ library_id: view.libraryId, sort: 'recent' }, signal).catch(() => ({ series: [] })),
            api
              .listItems({ library_id: view.libraryId, kind: 'movie', sort: 'recent', limit: 30 }, signal)
              .catch(() => ({ items: [], total: 0 })),
          ]);
          series = sRes.series.slice(0, 30);
          items = iRes.items.slice(0, 30);
        } else {
          const iRes = await api
            .listItems({ library_id: view.libraryId, sort: 'recent', limit: 30 }, signal)
            .catch(() => ({ items: [], total: 0 }));
          items = iRes.items.filter((m) => m.kind !== 'episode').slice(0, 30);
        }
        if (signal?.aborted) return;
        viewCache.setGrid(gKey, { series, items });
        setGridState({ key: gKey, series, items });
        return;
      }

      if (view.kind === 'discover' && gKey) {
        if (!force && viewCache.isGridFresh(gKey)) {
          const cached = viewCache.getGrid(gKey);
          if (cached) setGridState({ key: gKey, ...cached });
          return;
        }
        const itemsQuery = pagedItemsQuery(view, filters, sort, libs)!;
        const [sRes, iRes] = await Promise.all([
          api.listSeries(itemsQuery, signal).catch(() => ({ series: [] })),
          api
            .listItems({ ...itemsQuery, limit: GRID_PAGE_SIZE }, signal)
            .catch(() => ({ items: [], total: 0 })),
        ]);
        if (signal?.aborted) return;
        const grid = {
          series: sRes.series,
          items: appendGridItems([], iRes.items),
          itemsTotal: iRes.total,
          itemsOffset: iRes.items.length,
        };
        viewCache.setGrid(gKey, grid);
        setGridState({ key: gKey, ...grid });
        return;
      }

      if (view.kind === 'library' && gKey) {
        if (force || !viewCache.isLibraryFacetsFresh(view.libraryId)) {
          api
            .getLibraryFacets(view.libraryId, signal)
            .then((facets) => {
              if (signal?.aborted) return;
              viewCache.setLibraryFacets(view.libraryId, facets);
              setFacetsState({ libraryId: view.libraryId, facets });
            })
            .catch(() => {});
        } else {
          const cachedFacets = viewCache.getLibraryFacets(view.libraryId) ?? null;
          setFacetsState({ libraryId: view.libraryId, facets: cachedFacets });
        }

        if (!force && viewCache.isGridFresh(gKey)) {
          const cached = viewCache.getGrid(gKey);
          if (cached) {
            setGridState({
              key: gKey,
              series: cached.series,
              items: cached.items,
              itemsTotal: cached.itemsTotal,
              itemsOffset: cached.itemsOffset,
            });
            if (cached.favorites) setFavoriteItems(cached.favorites);
          }
          return;
        }
        const activeLibObj = libs.find((l) => l.id === view.libraryId);
        const favPromise = api.listFavorites(200, signal).catch(() => ({ items: [], total: 0 }));
        if (activeLibObj?.kind === 'shows') {
          const [sRes, favRes] = await Promise.all([
            api
              .listSeries({ library_id: view.libraryId, ...filters, sort }, signal)
              .catch(() => ({ series: [] })),
            favPromise,
          ]);
          if (signal?.aborted) return;
          viewCache.setGrid(gKey, { series: sRes.series, items: [], favorites: favRes.items });
          setGridState({ key: gKey, series: sRes.series, items: [] });
          setFavoriteItems(favRes.items);
        } else {
          const itemsQuery = pagedItemsQuery(view, filters, sort, libs)!;
          const [sRes, iRes, favRes] = await Promise.all([
            api
              .listSeries({ library_id: view.libraryId, ...filters, sort }, signal)
              .catch(() => ({ series: [] })),
            api
              .listItems({ ...itemsQuery, limit: GRID_PAGE_SIZE }, signal)
              .catch(() => ({ items: [], total: 0 })),
            favPromise,
          ]);
          if (signal?.aborted) return;
          const grid = {
            series: sRes.series,
            items: appendGridItems([], iRes.items),
            itemsTotal: iRes.total,
            itemsOffset: iRes.items.length,
          };
          viewCache.setGrid(gKey, { ...grid, favorites: favRes.items });
          setGridState({ key: gKey, ...grid });
          setFavoriteItems(favRes.items);
        }
      }
    },
    [user, view, search, sort, filters, navigateTo],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadData({ signal: controller.signal });
    return () => controller.abort();
  }, [loadData]);

  // Infinite scroll: fetch the next `/api/v1/items` page for the active Library/Discover grid.
  const gridHasMore =
    gridState.itemsTotal !== undefined &&
    (gridState.itemsOffset ?? 0) < gridState.itemsTotal &&
    gridState.key === gridKeyFor(view, search, sort, filters);

  const loadMoreGridItems = useCallback(async () => {
    const key = gridKeyFor(view, search, sort, filters);
    if (!key || key !== gridState.key || loadMoreInFlightRef.current === key) return;
    const offset = gridState.itemsOffset ?? 0;
    if (gridState.itemsTotal === undefined || offset >= gridState.itemsTotal) return;
    const query = pagedItemsQuery(view, filters, sort, libraries);
    if (!query) return;
    loadMoreInFlightRef.current = key;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    try {
      const res = await api.listItems({ ...query, limit: GRID_PAGE_SIZE, offset });
      setGridState((prev) => {
        if (prev.key !== key || (prev.itemsOffset ?? 0) !== offset) return prev;
        const next = {
          ...prev,
          items: appendGridItems(prev.items, res.items),
          itemsTotal: res.total,
          // An empty page means the total shrank underneath us; stop paging.
          itemsOffset: res.items.length > 0 ? offset + res.items.length : res.total,
        };
        const cached = viewCache.getGrid(key);
        viewCache.setGrid(key, {
          series: next.series,
          items: next.items,
          favorites: cached?.favorites,
          itemsTotal: next.itemsTotal,
          itemsOffset: next.itemsOffset,
        });
        return next;
      });
    } catch {
      // Stop auto-paging until the user retries, so a failing server isn't hammered in a loop.
      setLoadMoreFailed(true);
    } finally {
      if (loadMoreInFlightRef.current === key) loadMoreInFlightRef.current = null;
      setLoadingMore(false);
    }
  }, [view, search, sort, filters, libraries, gridState.key, gridState.itemsOffset, gridState.itemsTotal]);

  useEffect(() => {
    const el = loadMoreSentinelRef.current;
    if (!el || !gridHasMore || loadingMore || loadMoreFailed) return;
    // Re-created after every page so a sentinel still in view immediately triggers the next page.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMoreGridItems();
      },
      { rootMargin: '1200px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [gridHasMore, loadingMore, loadMoreFailed, loadMoreGridItems]);

  useEffect(() => {
    setLoadMoreFailed(false);
  }, [gridState.key]);

  // Mark cached views stale on mutations; only refetch immediately if the active view needs it.
  const handleCatalogMutated = useCallback(() => {
    invalidateCatalogCache();
    if (
      view.kind === 'home' ||
      view.kind === 'mylist' ||
      view.kind === 'library' ||
      view.kind === 'recent' ||
      view.kind === 'discover' ||
      view.kind === 'console'
    ) {
      loadData({ force: true });
    }
  }, [view.kind, loadData]);

  async function handleRemoveContinueWatching(item: MediaItemSummary) {
    setContinueItems((prev) => {
      const next = prev.filter((e) => e.item.id !== item.id);
      const cached = viewCache.getHome();
      if (cached) viewCache.setHome({ ...cached, continueItems: next });
      return next;
    });
    invalidateCatalogCache();
    try {
      await api.clearProgress(item.id);
    } catch {
      loadData({ force: true });
    }
  }

  async function handleRemoveWatchlist(item: MediaItemSummary) {
    setWatchlistItems((prev) => {
      const next = prev.filter((i) => i.id !== item.id);
      const cachedHome = viewCache.getHome();
      if (cachedHome) viewCache.setHome({ ...cachedHome, watchlistItems: next });
      const cachedList = viewCache.getMyList();
      if (cachedList) viewCache.setMyList({ ...cachedList, watchlistItems: next });
      return next;
    });
    invalidateCatalogCache();
    try {
      await api.removeFromWatchlist(item.id);
    } catch {
      loadData({ force: true });
    }
  }

  async function handleRemoveFavorite(item: MediaItemSummary) {
    setFavoriteItems((prev) => {
      const next = prev.filter((i) => i.id !== item.id);
      const cachedList = viewCache.getMyList();
      if (cachedList) viewCache.setMyList({ ...cachedList, favoriteItems: next });
      return next;
    });
    invalidateCatalogCache();
    try {
      await api.removeFromFavorites(item.id);
    } catch {
      loadData({ force: true });
    }
  }

  async function handleLogout() {
    await api.logout().catch(() => {});
    clearAllCaches();
    setUser(null);
    navigateTo({ kind: 'home' });
    bootstrap();
  }

  if (booting || !systemInfo) {
    return (
      <div className="lune-backdrop min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-ink-secondary text-sm">
          <LuneMark alt="Lune" className="w-7 h-7 animate-pulse" />
          <span>Connecting to Lune…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        systemInfo={systemInfo}
        inviteToken={inviteToken}
        onClearInvite={() => {
          setInviteToken(undefined);
          window.history.replaceState({ lune: true }, '', '/');
        }}
        onAuthenticated={(u) => {
          setUser(u);
          setInviteToken(undefined);
          if (window.location.pathname.startsWith('/invite/')) {
            window.history.replaceState({ lune: true }, '', '/');
          }
          setSystemInfo({ ...systemInfo, setup_required: false });
        }}
      />
    );
  }

  if (user.totp_required && !user.totp_enabled) {
    return (
      <TotpEnrollmentScreen
        user={user}
        onCompleted={() => setUser({ ...user, totp_enabled: true })}
        onSignOut={handleLogout}
      />
    );
  }

  const activeGridKey = gridKeyFor(view, search, sort, filters);
  const cachedGrid = activeGridKey ? viewCache.getGrid(activeGridKey) : undefined;
  const libSeries =
    (activeGridKey && gridState.key === activeGridKey ? gridState.series : cachedGrid?.series) ?? [];
  const libItems =
    (activeGridKey && gridState.key === activeGridKey ? gridState.items : cachedGrid?.items) ?? [];

  const activeLibrary =
    view.kind === 'library' ? libraries.find((l) => l.id === view.libraryId) ?? null : null;

  // Footer under paginated grids: an IntersectionObserver sentinel, a spinner while fetching,
  // and a manual retry if a page failed. Hidden on the anime "Series" tab (items aren't shown).
  const gridLoadMoreFooter =
    gridHasMore && !(activeLibrary?.kind === 'anime' && animeFilter === 'series') ? (
      <div ref={loadMoreSentinelRef} className="flex justify-center py-8 text-xs text-ink-secondary">
        {loadMoreFailed ? (
          <button
            type="button"
            onClick={() => loadMoreGridItems()}
            className="rounded-lg bg-surface border border-hairline hover:border-tone/35 px-3 py-1.5 font-medium text-ink transition-colors cursor-pointer"
          >
            Couldn’t load more titles — Retry
          </button>
        ) : (
          <span
            aria-live="polite"
            className={`inline-flex items-center gap-2 transition-opacity ${loadingMore ? 'opacity-100' : 'opacity-0'}`}
          >
            <span className="w-3.5 h-3.5 rounded-full border-2 border-tone/20 border-t-tone/70 animate-spin" />
            Loading more…
          </span>
        )}
      </div>
    ) : null;
  const activeFacets: LibraryFacets | null =
    view.kind === 'library'
      ? facetsState.libraryId === view.libraryId
        ? facetsState.facets
        : viewCache.getLibraryFacets(view.libraryId) ?? null
      : null;
  const combineNextUp = user?.preferences?.combine_next_up ?? true;

  const combinedContinueEntries: {
    item: MediaItemSummary;
    progress?: PlaybackProgress;
    hasProgress: boolean;
    sortTime: number;
  }[] = (() => {
    if (!combineNextUp) return [];
    const seen = new Set<string>();
    const merged: {
      item: MediaItemSummary;
      progress?: PlaybackProgress;
      hasProgress: boolean;
      sortTime: number;
    }[] = [];
    for (const entry of continueItems) {
      seen.add(entry.item.id);
      merged.push({
        item: entry.item,
        progress: entry.progress,
        hasProgress: entry.progress.position_ms > 0,
        sortTime:
          Date.parse(entry.progress.last_played_at ?? '') ||
          Date.parse(entry.item.created_at) ||
          0,
      });
    }
    for (const nu of nextUpItems) {
      if (seen.has(nu.item.id)) continue;
      seen.add(nu.item.id);
      merged.push({
        item: nu.item,
        hasProgress: false,
        sortTime: Date.parse(nu.last_played_at) || Date.parse(nu.item.created_at) || 0,
      });
    }
    merged.sort((a, b) => b.sortTime - a.sortTime);
    return merged;
  })();

  const separateNextUpItems: NextUpItem[] = (() => {
    if (combineNextUp) return [];
    const cwIds = new Set(continueItems.map((e) => e.item.id));
    return nextUpItems.filter((nu) => !cwIds.has(nu.item.id));
  })();
  const recentLibrary =
    view.kind === 'recent' ? libraries.find((l) => l.id === view.libraryId) ?? null : null;
  const activeNavLibId =
    view.kind === 'library'
      ? view.libraryId
      : view.kind === 'series'
        ? view.libraryId
        : view.kind === 'item'
          ? (view.initialItem?.library_id ?? viewCache.getItemDetail(view.itemId)?.library_id ?? '')
          : '';
  const isWatchView = view.kind === 'watch';
  const isSearching = search.trim() !== '' && (view.kind === 'home' || view.kind === 'library');
  const isFullBleedPage = view.kind === 'item' || view.kind === 'series' || isWatchView;
  const requestsEnabled = Boolean(systemInfo.requests_enabled);
  const canAccessRequests = requestsEnabled && (user.role === 'admin' || user.can_request !== false);

  const canSearchView = view.kind === 'home' || view.kind === 'library';
  const showMobileSearchBar = canSearchView && (mobileSearchOpen || search.trim() !== '');

  const navLinks = (
    <>
      <AppLink
        href="/"
        onNavigate={() => navigateTo({ kind: 'home' })}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
          view.kind === 'home'
            ? 'bg-tone/12 text-ink'
            : 'text-ink-secondary hover:text-ink'
        }`}
      >
        <Home className="w-3.5 h-3.5" />
        Home
      </AppLink>

      <AppLink
        href="/my-list"
        onNavigate={() => navigateTo({ kind: 'mylist', tab: 'watchlist' })}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
          view.kind === 'mylist'
            ? 'bg-tone/12 text-ink'
            : 'text-ink-secondary hover:text-ink'
        }`}
      >
        <Bookmark className="w-3.5 h-3.5" />
        My List
      </AppLink>

      {libraries.map((lib) => {
        const isActive = activeNavLibId === lib.id;
        return (
          <AppLink
            key={lib.id}
            href={libraryPath(lib.id)}
            onNavigate={() => navigateTo({ kind: 'library', libraryId: lib.id })}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
              isActive
                ? 'bg-tone/12 text-ink'
                : 'text-ink-secondary hover:text-ink'
            }`}
          >
            <LibraryIcon kind={lib.kind} />
            {lib.name}
          </AppLink>
        );
      })}

      {canAccessRequests && (
        <AppLink
          href="/requests"
          onNavigate={() => navigateTo({ kind: 'requests' })}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
            view.kind === 'requests'
              ? 'bg-tone/12 text-ink'
              : 'text-ink-secondary hover:text-ink'
          }`}
        >
          <Inbox className="w-3.5 h-3.5" />
          Requests
        </AppLink>
      )}
    </>
  );

  return (
    <PosterBadgesContext.Provider value={user.preferences?.poster_badges ?? []}>
    <div className="lune-backdrop min-h-dvh flex flex-col">
      {/* Top Navigation — stays visible above both detail pages and the enlarged theater player */}
      <header className="sticky top-0 z-50 bg-canvas/80 backdrop-blur-xl backdrop-saturate-150 border-b border-tone/[0.08]">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-4 lg:gap-5 min-w-0">
            <AppLink
              href="/"
              onNavigate={() => navigateTo({ kind: 'home' })}
              className="flex items-center gap-2 sm:gap-2.5 shrink-0 cursor-pointer"
            >
              <LuneMark alt="Lune" className="w-7 h-7" />
              <span className="text-base sm:text-lg font-semibold tracking-tight text-ink">Lune</span>
            </AppLink>

            <nav className="hidden md:flex items-center gap-1 overflow-x-auto no-scrollbar">
              {navLinks}
            </nav>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {canSearchView && (
              <>
                <div className="relative hidden md:block">
                  <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={activeLibrary ? `Search ${activeLibrary.name}…` : 'Search everything…'}
                    className="w-44 lg:w-56 xl:w-64 rounded-full bg-surface border border-tone/10 pl-8 pr-3 py-1.5 text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/35 transition-colors"
                  />
                </div>

                <button
                  type="button"
                  aria-label={showMobileSearchBar ? 'Close search' : 'Search library'}
                  aria-expanded={showMobileSearchBar}
                  onClick={() => {
                    if (showMobileSearchBar) {
                      setSearch('');
                      setMobileSearchOpen(false);
                    } else {
                      setMobileMenuOpen(false);
                      setMobileSearchOpen(true);
                    }
                  }}
                  className={`md:hidden inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors cursor-pointer ${
                    showMobileSearchBar
                      ? 'bg-tone/12 text-ink'
                      : 'text-ink-secondary hover:text-ink hover:bg-surface'
                  }`}
                >
                  {showMobileSearchBar ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
                </button>
              </>
            )}

            {/* Desktop & Tablet Utility Controls (sm+) */}
            <AppLink
              href="/pair"
              title="Pair TV or Mobile Device"
              onNavigate={() => navigateTo({ kind: 'pair' })}
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                view.kind === 'pair'
                  ? 'bg-tone/12 text-ink'
                  : 'text-ink-secondary hover:text-ink hover:bg-surface'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Pair</span>
            </AppLink>

            {user.role === 'admin' && (
              <AppLink
                href="/console"
                title="Admin Console"
                onNavigate={() => navigateTo({ kind: 'console', section: 'overview' })}
                className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  view.kind === 'console'
                    ? 'bg-tone/12 text-ink'
                    : 'text-ink-secondary hover:text-ink hover:bg-surface'
                }`}
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Console</span>
              </AppLink>
            )}

            <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-tone/[0.08]">
              <ThemeSwitcher variant="compact" />
              <button
                type="button"
                title="Playback Preferences (Audio, Subtitles, Anime Sub/Dub)"
                onClick={() => setShowPrefs(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs text-ink-secondary hover:text-ink hover:bg-elevated transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">{user.display_name}</span>
              </button>
              <button
                type="button"
                title="Sign out"
                onClick={handleLogout}
                className="p-1.5 rounded-full text-ink-secondary hover:text-ink hover:bg-elevated transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile Overflow / Account Menu (< sm) */}
            <div ref={mobileMenuRef} className="relative sm:hidden">
              <button
                type="button"
                aria-label="Open menu"
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen((v) => !v)}
                className={`inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors cursor-pointer ${
                  mobileMenuOpen
                    ? 'bg-tone/12 text-ink'
                    : 'text-ink-secondary hover:text-ink hover:bg-surface'
                }`}
              >
                {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>

              {mobileMenuOpen && (
                <div className="absolute right-0 top-11 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-surface/95 backdrop-blur-xl backdrop-saturate-150 border border-tone/12 shadow-2xl p-2 space-y-1">
                  <div className="px-2.5 py-1.5 border-b border-tone/[0.08] mb-1">
                    <div className="text-xs font-semibold text-ink truncate">{user.display_name}</div>
                    <div className="text-[11px] text-ink-muted truncate">@{user.username}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShowPrefs(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-ink hover:bg-tone/10 transition-colors cursor-pointer"
                  >
                    <SlidersHorizontal className="w-4 h-4 text-ink-secondary" />
                    Preferences
                  </button>

                  <AppLink
                    href="/pair"
                    onNavigate={() => navigateTo({ kind: 'pair' })}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                      view.kind === 'pair'
                        ? 'bg-tone/12 text-ink'
                        : 'text-ink hover:bg-tone/10'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-ink-secondary" />
                    Pair Device
                  </AppLink>

                  {user.role === 'admin' && (
                    <AppLink
                      href="/console"
                      onNavigate={() => navigateTo({ kind: 'console', section: 'overview' })}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                        view.kind === 'console'
                          ? 'bg-tone/12 text-ink'
                          : 'text-ink hover:bg-tone/10'
                      }`}
                    >
                      <Settings2 className="w-4 h-4 text-ink-secondary" />
                      Admin Console
                    </AppLink>
                  )}

                  <div className="px-2.5 py-2 border-y border-tone/[0.08] my-1 space-y-2">
                    <div className="text-[11px] font-medium text-ink-secondary">Theme</div>
                    <ThemeSwitcher variant="labeled" fullWidth />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleLogout();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Expandable Mobile Search Bar (< md) */}
        {showMobileSearchBar && (
          <div className="md:hidden px-4 pb-3">
            <div className="relative">
              <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                ref={mobileSearchInputRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={activeLibrary ? `Search ${activeLibrary.name}…` : 'Search everything…'}
                className="w-full rounded-xl bg-surface border border-tone/12 pl-10 pr-9 py-2 text-base sm:text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/40 transition-colors"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-ink-muted hover:text-ink cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Mobile Scrollable Primary Navigation Bar (< md, hidden during playback) */}
        {!isWatchView && (
          <nav
            aria-label="Primary navigation"
            className="md:hidden border-t border-tone/[0.06] px-4 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar"
          >
            {navLinks}
          </nav>
        )}
      </header>

      {/* Full-Bleed Detail Pages (Item / Series) */}
      {isFullBleedPage ? (
        <main className="flex-1 w-full">
          {view.kind === 'item' && (
            <ItemDetailPage
              key={view.itemId}
              itemId={view.itemId}
              initialItem={view.initialItem}
              isAdmin={user.role === 'admin'}
              refreshKey={detailRefreshKey}
              backLabel="Back"
              onBack={() => goBack({ kind: 'home' })}
              onPlay={(it, opts) => startPlayback(it, opts)}
              onSelectItem={(it) => navigateTo({ kind: 'item', itemId: it.id, initialItem: it })}
              onSelectSeries={(libraryId, title, initialSeries) =>
                goToTargetOrBack({ kind: 'series', libraryId, title, initialSeries })
              }
              onDiscover={(filter: DiscoverFilter) =>
                navigateTo({ kind: 'discover', filterKind: filter.kind, value: filter.value })
              }
              onMetadataUpdated={handleCatalogMutated}
            />
          )}
          {view.kind === 'series' && (
            <SeriesDetailPage
              key={`${view.libraryId}:${view.title}`}
              libraryId={view.libraryId}
              title={view.title}
              initialSeries={view.initialSeries}
              isAdmin={user.role === 'admin'}
              backLabel="Back"
              onBack={() => goBack({ kind: 'library', libraryId: view.libraryId })}
              onSelectEpisode={(ep) => navigateTo({ kind: 'item', itemId: ep.id, initialItem: ep })}
              onPlayEpisode={(ep) => startPlayback(ep)}
              onSelectSeries={(libraryId, title, initialSeries) =>
                navigateTo({ kind: 'series', libraryId, title, initialSeries })
              }
              onDiscover={(filter: DiscoverFilter) =>
                navigateTo({ kind: 'discover', filterKind: filter.kind, value: filter.value })
              }
              onMetadataUpdated={handleCatalogMutated}
            />
          )}
        </main>
      ) : (
        /* Standard Padded Container Views */
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
          {view.kind === 'console' && user.role === 'admin' && (
            <AdminConsole
              section={view.section}
              onSectionChange={(sec) => navigateTo({ kind: 'console', section: sec })}
              currentUserId={user.id}
              libraries={libraries}
              publicUrl={systemInfo.public_url}
              onLibrariesChanged={handleCatalogMutated}
              onRequestsConfigChange={(enabled) =>
                setSystemInfo((prev) => (prev ? { ...prev, requests_enabled: enabled } : prev))
              }
              onNetworkConfigChange={(cfg) =>
                setSystemInfo((prev) => {
                  if (!prev) return prev;
                  const liveMode = cfg.restart_required
                    ? cfg.active_edge_mode || cfg.edge_mode
                    : cfg.edge_mode;
                  let livePublicUrl: string | undefined;
                  if (liveMode === 'acme') {
                    livePublicUrl = cfg.domain?.trim() ? `https://${cfg.domain.trim()}` : undefined;
                  } else if (liveMode === 'proxy' || liveMode === 'tailscale') {
                    livePublicUrl = cfg.public_url?.trim() || undefined;
                  } else {
                    livePublicUrl = undefined;
                  }
                  return {
                    ...prev,
                    edge_mode: liveMode,
                    public_url: livePublicUrl,
                  };
                })
              }
            />
          )}

          {view.kind === 'requests' && (
            canAccessRequests ? (
              <RequestsPage
                isAdmin={user.role === 'admin'}
                currentUserId={user.id}
                onSelectItem={(itemId) => navigateTo({ kind: 'item', itemId })}
                onSelectSeries={(libraryId, title) =>
                  navigateTo({ kind: 'series', libraryId, title })
                }
              />
            ) : (
              <div className="rounded-2xl bg-surface/60 border border-tone/[0.08] p-12 text-center space-y-2">
                <div className="text-sm font-medium text-ink">Requests are not available</div>
                <p className="text-xs text-ink-secondary">
                  Media requests are currently disabled on this server or for your account.
                </p>
              </div>
            )
          )}

          {view.kind === 'pair' && <DevicePair />}

          {isSearching && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-sm font-semibold text-ink">
                  Search results for <span className="text-ink">“{search.trim()}”</span>
                  {activeLibrary ? ` in ${activeLibrary.name}` : ''}
                </h1>
                <div className="flex items-center gap-2.5">
                  <ViewModeToggle mode={viewMode} onChange={setViewMode} />
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="text-xs text-ink-secondary hover:text-ink cursor-pointer"
                  >
                    Clear search
                  </button>
                </div>
              </div>

              {libSeries.length === 0 && libItems.length === 0 ? (
                <div className="rounded-2xl bg-surface/60 border border-tone/[0.08] p-12 text-center text-xs text-ink-secondary">
                  No matching titles found.
                </div>
              ) : viewMode === 'list' ? (
                <div className="flex flex-col gap-2">
                  {libSeries.map((s) => (
                    <SeriesListRow
                      key={`${s.library_id}:${s.title}`}
                      series={s}
                      onSelect={(ser) =>
                        navigateTo({
                          kind: 'series',
                          libraryId: ser.library_id,
                          title: ser.title,
                          initialSeries: ser,
                        })
                      }
                    />
                  ))}
                  {libItems.map((item) => (
                    <MediaListRow
                      key={item.id}
                      item={item}
                      onSelect={(it) => navigateTo({ kind: 'item', itemId: it.id, initialItem: it })}
                    />
                  ))}
                </div>
              ) : (
                <div className="lune-poster-grid">
                  {libSeries.map((s) => (
                    <SeriesCard
                      key={`${s.library_id}:${s.title}`}
                      series={s}
                      onSelect={(ser) =>
                        navigateTo({
                          kind: 'series',
                          libraryId: ser.library_id,
                          title: ser.title,
                          initialSeries: ser,
                        })
                      }
                    />
                  ))}
                  {libItems.map((item) => (
                    <MediaCard
                      key={item.id}
                      item={item}
                      onSelect={(it) => navigateTo({ kind: 'item', itemId: it.id, initialItem: it })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {view.kind === 'home' && !isSearching && (
            <div className="space-y-10">
              {combineNextUp ? (
                combinedContinueEntries.length > 0 && (
                  <MediaShelf
                    itemCount={combinedContinueEntries.length}
                    header={
                      <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">
                        Continue Watching
                      </h2>
                    }
                  >
                    {combinedContinueEntries.map((entry) => (
                      <div key={entry.item.id} className={SHELF_CARD_CLASS}>
                        <MediaCard
                          item={entry.item}
                          progress={entry.progress}
                          onSelect={(it) =>
                            navigateTo({ kind: 'item', itemId: it.id, initialItem: it })
                          }
                          onRemove={entry.hasProgress ? handleRemoveContinueWatching : undefined}
                          removeLabel="Remove from Continue Watching"
                        />
                      </div>
                    ))}
                  </MediaShelf>
                )
              ) : (
                <>
                  {continueItems.length > 0 && (
                    <MediaShelf
                      itemCount={continueItems.length}
                      header={
                        <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">
                          Continue Watching
                        </h2>
                      }
                    >
                      {continueItems.map((entry) => (
                        <div key={entry.item.id} className={SHELF_CARD_CLASS}>
                          <MediaCard
                            item={entry.item}
                            progress={entry.progress}
                            onSelect={(it) =>
                              navigateTo({ kind: 'item', itemId: it.id, initialItem: it })
                            }
                            onRemove={handleRemoveContinueWatching}
                            removeLabel="Remove from Continue Watching"
                          />
                        </div>
                      ))}
                    </MediaShelf>
                  )}

                  {separateNextUpItems.length > 0 && (
                    <MediaShelf
                      itemCount={separateNextUpItems.length}
                      header={
                        <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">
                          Next Up
                        </h2>
                      }
                    >
                      {separateNextUpItems.map((entry) => (
                        <div key={entry.item.id} className={SHELF_CARD_CLASS}>
                          <MediaCard
                            item={entry.item}
                            onSelect={(it) =>
                              navigateTo({ kind: 'item', itemId: it.id, initialItem: it })
                            }
                          />
                        </div>
                      ))}
                    </MediaShelf>
                  )}
                </>
              )}

              {watchlistItems.length > 0 && (
                <MediaShelf
                  itemCount={watchlistItems.length}
                  header={
                    <button
                      type="button"
                      onClick={() => navigateTo({ kind: 'mylist', tab: 'watchlist' })}
                      className="group inline-flex items-center gap-1 text-lg font-semibold tracking-[-0.02em] text-ink hover:text-ink transition-colors cursor-pointer"
                    >
                      <span>My Watchlist</span>
                      <ChevronRight className="w-4 h-4 text-ink-secondary group-hover:text-ink group-hover:translate-x-0.5 transition-all" />
                    </button>
                  }
                >
                  {watchlistItems.slice(0, 15).map((item) => (
                    <div key={item.id} className={SHELF_CARD_CLASS}>
                      <MediaCard
                        item={item}
                        onSelect={(it) =>
                          navigateTo({ kind: 'item', itemId: it.id, initialItem: it })
                        }
                        onRemove={handleRemoveWatchlist}
                        removeLabel="Remove from Watchlist"
                      />
                    </div>
                  ))}
                </MediaShelf>
              )}

              {libraries.length === 0 ? (
                homeLoading ? (
                  <div className="py-16 flex items-center justify-center gap-3 text-sm text-ink-secondary">
                    <LuneMark alt="Lune" className="w-6 h-6 animate-pulse" />
                    <span>Loading your library…</span>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-surface/60 border border-tone/[0.08] p-12 text-center flex flex-col items-center">
                    <div className="w-12 h-12 rounded-2xl bg-elevated flex items-center justify-center text-ink mb-4">
                      <FolderOpen className="w-6 h-6" />
                    </div>
                    <h3 className="text-base font-semibold text-ink">Your universe is ready</h3>
                    <p className="text-xs text-ink-secondary mt-1 max-w-sm">
                      Register a media folder in the Console to scan your movies, shows, anime, or music.
                    </p>
                    {user.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => navigateTo({ kind: 'console', section: 'libraries' })}
                        className="mt-5 rounded-lg bg-accent hover:bg-accent-hover text-on-accent font-semibold text-xs px-4 py-2 transition-colors cursor-pointer"
                      >
                        Configure Libraries
                      </button>
                    )}
                  </div>
                )
              ) : homeShelves.length === 0 && homeLoading ? (
                <div className="py-16 flex items-center justify-center gap-3 text-sm text-ink-secondary">
                  <LuneMark alt="Lune" className="w-6 h-6 animate-pulse" />
                  <span>Loading your library…</span>
                </div>
              ) : (
                homeShelves.map(({ library, series, items }) => {
                  const count = series.length + items.length;
                  if (count === 0) return null;
                  return (
                    <MediaShelf
                      key={library.id}
                      itemCount={count}
                      header={
                        <button
                          type="button"
                          onClick={() => navigateTo({ kind: 'recent', libraryId: library.id })}
                          className="group inline-flex items-center gap-1 text-lg font-semibold tracking-[-0.02em] text-ink hover:text-ink transition-colors cursor-pointer"
                        >
                          <span>Recently Added in {library.name}</span>
                          <ChevronRight className="w-4 h-4 text-ink-secondary group-hover:text-ink group-hover:translate-x-0.5 transition-all" />
                        </button>
                      }
                    >
                      {series.map((s) => (
                        <div key={`${s.library_id}:${s.title}`} className={SHELF_CARD_CLASS}>
                          <SeriesCard
                            series={s}
                            onSelect={(ser) =>
                              navigateTo({
                                kind: 'series',
                                libraryId: ser.library_id,
                                title: ser.title,
                                initialSeries: ser,
                              })
                            }
                          />
                        </div>
                      ))}
                      {items.map((item) => (
                        <div key={item.id} className={SHELF_CARD_CLASS}>
                          <MediaCard
                            item={item}
                            onSelect={(it) =>
                              navigateTo({ kind: 'item', itemId: it.id, initialItem: it })
                            }
                          />
                        </div>
                      ))}
                    </MediaShelf>
                  );
                })
              )}
            </div>
          )}

          {view.kind === 'mylist' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-tone/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-surface border border-tone/10 flex items-center justify-center text-ink">
                    {view.tab === 'favorites' ? (
                      <Heart className="w-5 h-5 text-danger" />
                    ) : (
                      <Bookmark className="w-5 h-5 text-ink" />
                    )}
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold text-ink tracking-tight">
                      {view.tab === 'favorites' ? 'Favorites' : 'My Watchlist'}
                    </h1>
                    <div className="text-xs tabular-nums text-ink-secondary">
                      {(view.tab === 'favorites' ? favoriteItems.length : watchlistItems.length)}{' '}
                      {(view.tab === 'favorites' ? favoriteItems.length : watchlistItems.length) === 1
                        ? 'title'
                        : 'titles'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <ViewModeToggle mode={viewMode} onChange={setViewMode} />

                  <div className="inline-flex items-center rounded-lg bg-surface border border-hairline p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => navigateTo({ kind: 'mylist', tab: 'watchlist' })}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                        view.tab === 'watchlist'
                          ? 'bg-tone/12 text-ink'
                          : 'text-ink-secondary hover:text-ink'
                      }`}
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      Watchlist
                      <span className="tabular-nums text-[10px] opacity-70">{watchlistItems.length}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateTo({ kind: 'mylist', tab: 'favorites' })}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                        view.tab === 'favorites'
                          ? 'bg-danger/20 text-ink'
                          : 'text-ink-secondary hover:text-ink'
                      }`}
                    >
                      <Heart className="w-3.5 h-3.5" />
                      Favorites
                      <span className="tabular-nums text-[10px] opacity-70">{favoriteItems.length}</span>
                    </button>
                  </div>
                </div>
              </div>

              {(view.tab === 'favorites' ? favoriteItems : watchlistItems).length === 0 ? (
                <div className="rounded-2xl bg-surface/60 border border-tone/[0.08] p-12 text-center flex flex-col items-center">
                  <div className="w-11 h-11 rounded-2xl bg-elevated flex items-center justify-center text-ink mb-3">
                    {view.tab === 'favorites' ? (
                      <Heart className="w-5 h-5 text-danger" />
                    ) : (
                      <Bookmark className="w-5 h-5 text-ink" />
                    )}
                  </div>
                  <div className="text-sm font-medium text-ink">
                    {view.tab === 'favorites' ? 'No favorites yet' : 'Your watchlist is empty'}
                  </div>
                  <p className="text-xs text-ink-secondary mt-1 max-w-sm">
                    {view.tab === 'favorites'
                      ? 'Mark movies or episodes with the heart button on their detail page to collect your favorites here.'
                      : 'Add movies or episodes to your watchlist from their detail page to keep track of what you want to watch next.'}
                  </p>
                </div>
              ) : viewMode === 'list' ? (
                <div className="flex flex-col gap-2">
                  {(view.tab === 'favorites' ? favoriteItems : watchlistItems).map((item) => (
                    <MediaListRow
                      key={item.id}
                      item={item}
                      onSelect={(it) =>
                        navigateTo({ kind: 'item', itemId: it.id, initialItem: it })
                      }
                      onRemove={view.tab === 'favorites' ? handleRemoveFavorite : handleRemoveWatchlist}
                      removeLabel={
                        view.tab === 'favorites' ? 'Remove from Favorites' : 'Remove from Watchlist'
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="lune-poster-grid">
                  {(view.tab === 'favorites' ? favoriteItems : watchlistItems).map((item) => (
                    <MediaCard
                      key={item.id}
                      item={item}
                      onSelect={(it) =>
                        navigateTo({ kind: 'item', itemId: it.id, initialItem: it })
                      }
                      onRemove={view.tab === 'favorites' ? handleRemoveFavorite : handleRemoveWatchlist}
                      removeLabel={
                        view.tab === 'favorites' ? 'Remove from Favorites' : 'Remove from Watchlist'
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {view.kind === 'recent' && recentLibrary && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-tone/[0.08]">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => goBack({ kind: 'home' })}
                    aria-label="Back"
                    className="w-9 h-9 rounded-xl bg-surface border border-tone/10 flex items-center justify-center text-ink-secondary hover:text-ink hover:border-accent/45 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="w-10 h-10 rounded-xl bg-surface border border-tone/10 flex items-center justify-center text-ink">
                    <LibraryIcon kind={recentLibrary.kind} className="w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold text-ink tracking-tight">
                      Recently Added in {recentLibrary.name}
                    </h1>
                    <div className="text-xs tabular-nums text-ink-secondary">
                      Latest {libSeries.length + libItems.length}{' '}
                      {libSeries.length + libItems.length === 1 ? 'addition' : 'additions'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <ViewModeToggle mode={viewMode} onChange={setViewMode} />
                  <button
                    type="button"
                    onClick={() => navigateTo({ kind: 'library', libraryId: recentLibrary.id })}
                    className="inline-flex items-center gap-1 rounded-lg bg-surface border border-hairline hover:border-accent/50 px-3 py-1.5 text-xs font-medium text-ink hover:text-ink transition-colors cursor-pointer"
                  >
                    <span>Browse all {recentLibrary.name}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {libSeries.length === 0 && libItems.length === 0 ? (
                <div className="rounded-2xl bg-surface/60 border border-tone/[0.08] p-12 text-center text-xs text-ink-secondary">
                  No indexed media in {recentLibrary.name} yet. Run a scan in Console.
                </div>
              ) : viewMode === 'list' ? (
                <div className="flex flex-col gap-2">
                  {libSeries.map((s) => (
                    <SeriesListRow
                      key={`${s.library_id}:${s.title}`}
                      series={s}
                      onSelect={(ser) =>
                        navigateTo({
                          kind: 'series',
                          libraryId: ser.library_id,
                          title: ser.title,
                          initialSeries: ser,
                        })
                      }
                    />
                  ))}
                  {libItems.map((item) => (
                    <MediaListRow
                      key={item.id}
                      item={item}
                      onSelect={(it) =>
                        navigateTo({ kind: 'item', itemId: it.id, initialItem: it })
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="lune-poster-grid">
                  {libSeries.map((s) => (
                    <SeriesCard
                      key={`${s.library_id}:${s.title}`}
                      series={s}
                      onSelect={(ser) =>
                        navigateTo({
                          kind: 'series',
                          libraryId: ser.library_id,
                          title: ser.title,
                          initialSeries: ser,
                        })
                      }
                    />
                  ))}
                  {libItems.map((item) => (
                    <MediaCard
                      key={item.id}
                      item={item}
                      onSelect={(it) =>
                        navigateTo({ kind: 'item', itemId: it.id, initialItem: it })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {view.kind === 'discover' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-tone/[0.08]">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => goBack({ kind: 'home' })}
                    aria-label="Back"
                    className="w-9 h-9 rounded-xl bg-surface border border-tone/10 flex items-center justify-center text-ink-secondary hover:text-ink hover:border-tone/25 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                      {view.filterKind === 'genre'
                        ? 'Genre'
                        : view.filterKind === 'studio'
                          ? 'Studio'
                          : 'Cast & Crew'}
                    </div>
                    <h1 className="text-xl font-semibold text-ink tracking-tight">{view.value}</h1>
                    <div className="text-xs tabular-nums text-ink-secondary">
                      {libSeries.length + libItems.length}
                      {gridHasMore ? '+' : ''}{' '}
                      {libSeries.length + libItems.length === 1 && !gridHasMore ? 'title' : 'titles'} in your
                      library
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <ViewModeToggle mode={viewMode} onChange={setViewMode} />
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortOption)}
                    className="rounded-lg bg-surface border border-hairline px-3 py-1.5 text-base sm:text-xs text-ink focus:outline-none focus:border-tone/50"
                  >
                    <option value="title">Title (A–Z)</option>
                    <option value="recent">Recently Added</option>
                    <option value="year">Release Year</option>
                    <option value="rating">Highest Rated</option>
                  </select>
                </div>
              </div>

              {libSeries.length === 0 && libItems.length === 0 ? (
                <div className="rounded-2xl bg-surface/60 border border-tone/[0.08] p-12 text-center text-xs text-ink-secondary">
                  No matching titles found in your libraries.
                </div>
              ) : viewMode === 'list' ? (
                <div className="flex flex-col gap-2">
                  {libSeries.map((s) => (
                    <SeriesListRow
                      key={`${s.library_id}:${s.title}`}
                      series={s}
                      onSelect={(ser) =>
                        navigateTo({
                          kind: 'series',
                          libraryId: ser.library_id,
                          title: ser.title,
                          initialSeries: ser,
                        })
                      }
                    />
                  ))}
                  {libItems.map((item) => (
                    <MediaListRow
                      key={item.id}
                      item={item}
                      onSelect={(it) =>
                        navigateTo({ kind: 'item', itemId: it.id, initialItem: it })
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="lune-poster-grid">
                  {libSeries.map((s) => (
                    <SeriesCard
                      key={`${s.library_id}:${s.title}`}
                      series={s}
                      onSelect={(ser) =>
                        navigateTo({
                          kind: 'series',
                          libraryId: ser.library_id,
                          title: ser.title,
                          initialSeries: ser,
                        })
                      }
                    />
                  ))}
                  {libItems.map((item) => (
                    <MediaCard
                      key={item.id}
                      item={item}
                      onSelect={(it) =>
                        navigateTo({ kind: 'item', itemId: it.id, initialItem: it })
                      }
                    />
                  ))}
                </div>
              )}
              {gridLoadMoreFooter}
            </div>
          )}

          {view.kind === 'library' && activeLibrary && !isSearching && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-tone/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-surface border border-tone/10 flex items-center justify-center text-ink">
                    <LibraryIcon kind={activeLibrary.kind} className="w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold text-ink tracking-tight">
                      {activeLibrary.name}
                    </h1>
                    <div className="text-xs tabular-nums text-ink-secondary">
                      {activeLibrary.kind === 'shows'
                        ? `${libSeries.length} series · ${activeLibrary.item_count} episodes`
                        : activeLibrary.kind === 'anime'
                          ? [
                              libSeries.length > 0
                                ? `${libSeries.length} ${libSeries.length === 1 ? 'series' : 'series'}`
                                : null,
                              libItems.length > 0
                                ? (() => {
                                    const films =
                                      (gridState.key === activeGridKey
                                        ? gridState.itemsTotal
                                        : cachedGrid?.itemsTotal) ?? libItems.length;
                                    return `${films} ${films === 1 ? 'film' : 'films'}`;
                                  })()
                                : null,
                              `${activeLibrary.item_count} ${activeLibrary.item_count === 1 ? 'file' : 'files'}`,
                            ]
                              .filter(Boolean)
                              .join(' · ')
                          : `${activeLibrary.item_count} ${activeLibrary.item_count === 1 ? 'item' : 'items'}`}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {activeLibrary.kind === 'anime' && libSeries.length > 0 && libItems.length > 0 && (
                    <div className="inline-flex items-center rounded-lg bg-surface border border-hairline p-0.5 text-xs">
                      {(['all', 'series', 'movies'] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setAnimeFilter(tab)}
                          className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                            animeFilter === tab
                              ? 'bg-tone/12 text-ink'
                              : 'text-ink-secondary hover:text-ink'
                          }`}
                        >
                          {tab === 'all' ? 'All' : tab === 'series' ? 'Series' : 'Films'}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setFavoritesOnly((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      favoritesOnly
                        ? 'bg-danger/15 border-danger/50 text-danger'
                        : 'bg-surface border-hairline text-ink-secondary hover:text-ink hover:border-danger/40'
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${favoritesOnly ? 'fill-current' : ''}`} />
                    Favorites
                  </button>

                  <ViewModeToggle mode={viewMode} onChange={setViewMode} />

                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortOption)}
                    className="rounded-lg bg-surface border border-hairline px-3 py-1.5 text-base sm:text-xs text-ink focus:outline-none focus:border-tone/50"
                  >
                    <option value="title">Title (A–Z)</option>
                    <option value="recent">Recently Added</option>
                    <option value="year">Release Year</option>
                    <option value="rating">Highest Rated</option>
                  </select>
                </div>
              </div>

              <LibraryFilterBar
                facets={activeFacets}
                filters={filters}
                onChange={setFilters}
                onReset={() => setFilters({})}
              />

              {(() => {
                const activeFilterCount = countActiveFilters(filters);
                const favIdSet = favoritesOnly ? new Set(favoriteItems.map((f) => f.id)) : null;
                const favSeriesSet = favoritesOnly
                  ? new Set(
                      favoriteItems
                        .filter((f) => f.series_title)
                        .map((f) => `${f.library_id}:${f.series_title!.toLowerCase()}`),
                    )
                  : null;
                const visibleSeries =
                  activeLibrary.kind !== 'anime' || animeFilter !== 'movies'
                    ? favSeriesSet
                      ? libSeries.filter((s) =>
                          favSeriesSet.has(`${s.library_id}:${s.title.toLowerCase()}`),
                        )
                      : libSeries
                    : [];
                const visibleItems =
                  activeLibrary.kind !== 'anime' || animeFilter !== 'series'
                    ? favIdSet
                      ? libItems.filter((it) => favIdSet.has(it.id))
                      : libItems
                    : [];

                if (visibleSeries.length === 0 && visibleItems.length === 0) {
                  return (
                    <div className="rounded-2xl bg-surface/60 border border-tone/[0.08] p-12 text-center space-y-3">
                      <div className="text-xs text-ink-secondary">
                        {favoritesOnly
                          ? `No favorites in ${activeLibrary.name} yet.`
                          : activeFilterCount > 0
                            ? `No titles match the active filters in ${activeLibrary.name}.`
                            : `No indexed media in ${activeLibrary.name} yet. Run a scan in Console.`}
                      </div>
                      {activeFilterCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setFilters({})}
                          className="rounded-lg bg-surface border border-hairline hover:border-tone/35 px-3 py-1.5 text-xs font-medium text-ink transition-colors cursor-pointer"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  );
                }

                if (viewMode === 'list') {
                  return (
                    <div className="flex flex-col gap-2">
                      {visibleSeries.map((s) => (
                        <SeriesListRow
                          key={`${s.library_id}:${s.title}`}
                          series={s}
                          onSelect={(ser) =>
                            navigateTo({
                              kind: 'series',
                              libraryId: ser.library_id,
                              title: ser.title,
                              initialSeries: ser,
                            })
                          }
                        />
                      ))}
                      {visibleItems.map((item) => (
                        <MediaListRow
                          key={item.id}
                          item={item}
                          onSelect={(it) =>
                            navigateTo({ kind: 'item', itemId: it.id, initialItem: it })
                          }
                        />
                      ))}
                    </div>
                  );
                }

                return (
                  <div className="lune-poster-grid">
                    {visibleSeries.map((s) => (
                      <SeriesCard
                        key={`${s.library_id}:${s.title}`}
                        series={s}
                        onSelect={(ser) =>
                          navigateTo({
                            kind: 'series',
                            libraryId: ser.library_id,
                            title: ser.title,
                            initialSeries: ser,
                          })
                        }
                      />
                    ))}
                    {visibleItems.map((item) => (
                      <MediaCard
                        key={item.id}
                        item={item}
                        onSelect={(it) =>
                          navigateTo({ kind: 'item', itemId: it.id, initialItem: it })
                        }
                      />
                    ))}
                  </div>
                );
              })()}
              {gridLoadMoreFooter}
            </div>
          )}
        </main>
      )}

      {view.kind === 'watch' && (
        <TheaterPlayer
          key={view.itemId}
          itemId={view.itemId}
          initialItem={view.initialItem ?? viewCache.getItemDetail(view.itemId) ?? undefined}
          launchOptions={view.launchOptions}
          userPreferences={user.preferences}
          onClose={() => {
            setDetailRefreshKey((k) => k + 1);
            goBack({ kind: 'item', itemId: view.itemId, initialItem: view.initialItem });
          }}
          onSelectItem={(next) => {
            const nextView: View = { kind: 'watch', itemId: next.id, initialItem: next };
            const state = window.history.state as LuneHistoryState | null;
            window.history.replaceState(
              { lune: true, entryId: currentEntryIdRef.current, prevPath: state?.prevPath } satisfies LuneHistoryState,
              '',
              viewToPath(nextView),
            );
            setView(nextView);
          }}
          onProgressUpdated={() => {
            handleCatalogMutated();
            setDetailRefreshKey((k) => k + 1);
          }}
        />
      )}

      {showPrefs && (
        <PreferencesModal
          displayName={user.display_name}
          initialPrefs={user.preferences}
          onClose={() => setShowPrefs(false)}
          onSaved={(displayName, preferences) =>
            setUser((prev) => (prev ? { ...prev, display_name: displayName, preferences } : prev))
          }
        />
      )}
    </div>
    </PosterBadgesContext.Provider>
  );
}
