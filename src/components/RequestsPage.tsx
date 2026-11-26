import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Film,
  Inbox,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Star,
  Tv,
  X,
  XCircle,
} from 'lucide-react';
import {
  api,
  ApiError,
  type DiscoverItem,
  type DiscoverSort,
  type MediaRequest,
  type RequestStatus,
} from '../lib/api';
import { useBodyScrollLock } from '../lib/useBodyScrollLock';
import { LuneMark } from './LuneMark';

interface Props {
  isAdmin: boolean;
  currentUserId: string;
  onSelectItem: (itemId: string) => void;
  onSelectSeries: (libraryId: string, title: string) => void;
}

type PageTab = 'discover' | 'mine' | 'all';
type DiscoverTab = 'trending' | 'movies' | 'tv' | 'anime';
type AvailabilityFilter = 'all' | 'requestable' | 'available';

const DISCOVER_CATEGORIES: { id: DiscoverTab; label: string }[] = [
  { id: 'trending', label: 'Trending' },
  { id: 'movies', label: 'Movies' },
  { id: 'tv', label: 'TV Shows' },
  { id: 'anime', label: 'Anime' },
];

const MOVIE_GENRES: { id: number; name: string }[] = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 14, name: 'Fantasy' },
  { id: 36, name: 'History' },
  { id: 27, name: 'Horror' },
  { id: 10402, name: 'Music' },
  { id: 9648, name: 'Mystery' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Sci-Fi' },
  { id: 53, name: 'Thriller' },
  { id: 10752, name: 'War' },
  { id: 37, name: 'Western' },
];

const TV_GENRES: { id: number; name: string }[] = [
  { id: 10759, name: 'Action & Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 10762, name: 'Kids' },
  { id: 9648, name: 'Mystery' },
  { id: 10765, name: 'Sci-Fi & Fantasy' },
  { id: 10768, name: 'War & Politics' },
  { id: 37, name: 'Western' },
];

const ANIME_GENRES = TV_GENRES.filter((g) => g.id !== 16);

const LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: 'en', label: 'English (en)' },
  { code: 'ja', label: 'Japanese (ja)' },
  { code: 'ko', label: 'Korean (ko)' },
  { code: 'fr', label: 'French (fr)' },
  { code: 'es', label: 'Spanish (es)' },
  { code: 'de', label: 'German (de)' },
  { code: 'zh', label: 'Chinese (zh)' },
  { code: 'it', label: 'Italian (it)' },
];

const DISCOVER_YEARS: number[] = (() => {
  const maxYear = new Date().getFullYear() + 1;
  const years: number[] = [];
  for (let y = maxYear; y >= 1970; y--) {
    years.push(y);
  }
  return years;
})();

function genresForTab(tab: DiscoverTab): { id: number; name: string }[] {
  if (tab === 'tv') return TV_GENRES;
  if (tab === 'anime') return ANIME_GENRES;
  return MOVIE_GENRES;
}

function formatRelativeDate(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(ts).toLocaleDateString();
}

function mediaTypeLabel(mediaType: 'movie' | 'tv', isAnime: boolean): string {
  if (isAnime) return 'Anime';
  return mediaType === 'movie' ? 'Movie' : 'Series';
}

function StatusBadge({ status }: { status: RequestStatus }) {
  switch (status) {
    case 'available':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-healthy/15 text-healthy text-[11px] font-medium">
          <CheckCircle2 className="w-3 h-3" />
          Available
        </span>
      );
    case 'approved':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-telemetry/15 text-telemetry text-[11px] font-medium">
          <Check className="w-3 h-3" />
          Approved
        </span>
      );
    case 'processing':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-telemetry/15 text-telemetry text-[11px] font-medium">
          <Loader2 className="w-3 h-3 animate-spin" />
          Processing
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/15 text-warning text-[11px] font-medium">
          <Clock className="w-3 h-3" />
          Pending
        </span>
      );
    case 'declined':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger/15 text-danger text-[11px] font-medium">
          <XCircle className="w-3 h-3" />
          Declined
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger/15 text-danger text-[11px] font-medium">
          <XCircle className="w-3 h-3" />
          Failed
        </span>
      );
  }
}

export function RequestsPage({
  isAdmin,
  currentUserId,
  onSelectItem,
  onSelectSeries,
}: Props) {
  const [activeTab, setActiveTab] = useState<PageTab>('discover');

  // Discover state
  const [discoverTab, setDiscoverTab] = useState<DiscoverTab>('trending');
  const [sort, setSort] = useState<DiscoverSort>('popularity');
  const [genre, setGenre] = useState<number>(0);
  const [year, setYear] = useState<number>(0);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const datePopoverRef = useRef<HTMLDivElement | null>(null);
  const [minRating, setMinRating] = useState<number>(0);
  const [language, setLanguage] = useState<string>('');
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');
  const [viewMode, setViewMode] = useState<'poster' | 'list'>(() => {
    try {
      return localStorage.getItem('lune_view_mode') === 'list' ? 'list' : 'poster';
    } catch {
      return 'poster';
    }
  });
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [discoverItems, setDiscoverItems] = useState<DiscoverItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [discoverErr, setDiscoverErr] = useState('');

  const availableGenres = useMemo(() => genresForTab(discoverTab), [discoverTab]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (!debouncedQuery) {
      if (sort !== 'popularity') count++;
      if (genre > 0) count++;
      if (year > 0 || dateFrom !== '' || dateTo !== '') count++;
      if (minRating > 0) count++;
      if (language !== '' && discoverTab !== 'anime') count++;
    }
    if (availability !== 'all') count++;
    return count;
  }, [debouncedQuery, sort, genre, year, dateFrom, dateTo, minRating, language, discoverTab, availability]);

  const filteredDiscoverItems = useMemo(() => {
    if (availability === 'requestable') {
      return discoverItems.filter((item) => !item.in_library);
    }
    if (availability === 'available') {
      return discoverItems.filter((item) => item.in_library);
    }
    return discoverItems;
  }, [discoverItems, availability]);

  // Keep poster grid rows evenly filled and consistent across "Load more" clicks.
  const [posterGridEl, setPosterGridEl] = useState<HTMLDivElement | null>(null);
  const [posterGridCols, setPosterGridCols] = useState(0);
  const [posterBatches, setPosterBatches] = useState(1);

  useEffect(() => {
    if (!posterGridEl) return;
    const measure = () => {
      const cols = window
        .getComputedStyle(posterGridEl)
        .gridTemplateColumns.split(' ')
        .filter((s) => s.trim() !== '' && s !== 'none').length;
      if (cols > 0) setPosterGridCols(cols);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(posterGridEl);
    return () => ro.disconnect();
  }, [posterGridEl]);

  const rowsPerBatch = useMemo(() => {
    if (posterGridCols >= 6) return 3;
    if (posterGridCols === 5) return 4;
    if (posterGridCols === 4) return 5;
    if (posterGridCols === 3) return 6;
    return 10;
  }, [posterGridCols]);

  const targetPosterCount =
    posterGridCols > 1 ? posterBatches * rowsPerBatch * posterGridCols : filteredDiscoverItems.length;

  const visiblePosterItems = useMemo(() => {
    if (
      posterGridCols <= 1 ||
      (page >= totalPages && filteredDiscoverItems.length <= targetPosterCount)
    ) {
      return filteredDiscoverItems;
    }
    if (filteredDiscoverItems.length >= targetPosterCount) {
      return filteredDiscoverItems.slice(0, targetPosterCount);
    }
    if (page >= totalPages || filteredDiscoverItems.length < posterGridCols) {
      return filteredDiscoverItems;
    }
    const fullRowCount =
      Math.floor(filteredDiscoverItems.length / posterGridCols) * posterGridCols;
    return filteredDiscoverItems.slice(0, fullRowCount);
  }, [filteredDiscoverItems, page, totalPages, posterGridCols, targetPosterCount]);

  function handleSelectDiscoverTab(nextTab: DiscoverTab) {
    setSearchInput('');
    setDebouncedQuery('');
    const nextGenres = genresForTab(nextTab);
    if (genre > 0 && !nextGenres.some((g) => g.id === genre)) {
      setGenre(0);
    }
    if (nextTab === 'anime' && language !== '') {
      setLanguage('');
    }
    setDiscoverTab(nextTab);
  }

  function handleSortChange(nextSort: DiscoverSort) {
    setSort(nextSort);
    if (nextSort !== 'popularity' && discoverTab === 'trending') {
      setDiscoverTab('movies');
    }
  }

  function handleGenreChange(nextGenre: number) {
    setGenre(nextGenre);
    if (nextGenre > 0 && discoverTab === 'trending') {
      setDiscoverTab('movies');
    }
  }

  function handleYearChange(nextYear: number) {
    setYear(nextYear);
    if (nextYear > 0) {
      setDateFrom('');
      setDateTo('');
      if (discoverTab === 'trending') {
        setDiscoverTab('movies');
      }
    }
  }

  function handleDateRangeChange(nextFrom: string, nextTo: string) {
    setDateFrom(nextFrom);
    setDateTo(nextTo);
    if (nextFrom || nextTo) {
      setYear(0);
      if (discoverTab === 'trending') {
        setDiscoverTab('movies');
      }
    }
  }

  useEffect(() => {
    if (!datePopoverOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (datePopoverRef.current && !datePopoverRef.current.contains(e.target as Node)) {
        setDatePopoverOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDatePopoverOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [datePopoverOpen]);

  const dateFilterLabel = useMemo(() => {
    const fmt = (iso: string) => {
      if (iso.endsWith('-01-01') || iso.endsWith('-12-31')) return iso.slice(0, 4);
      const d = new Date(`${iso}T00:00:00`);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    };
    if (dateFrom && dateTo) {
      const a = fmt(dateFrom);
      const b = fmt(dateTo);
      return a === b ? a : `${a}–${b}`;
    }
    if (dateFrom) return `${fmt(dateFrom)}+`;
    if (dateTo) return `≤ ${fmt(dateTo)}`;
    if (year > 0) return String(year);
    return 'Any year';
  }, [year, dateFrom, dateTo]);

  function handleMinRatingChange(nextMinRating: number) {
    setMinRating(nextMinRating);
    if (nextMinRating > 0 && discoverTab === 'trending') {
      setDiscoverTab('movies');
    }
  }

  function handleLanguageChange(nextLanguage: string) {
    setLanguage(nextLanguage);
    if (nextLanguage !== '' && discoverTab === 'trending') {
      setDiscoverTab('movies');
    }
  }

  function handleResetFilters() {
    setSort('popularity');
    setGenre(0);
    setYear(0);
    setDateFrom('');
    setDateTo('');
    setDatePopoverOpen(false);
    setMinRating(0);
    setLanguage('');
    setAvailability('all');
  }

  // Confirm request modal
  const [confirmItem, setConfirmItem] = useState<DiscoverItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState('');

  useBodyScrollLock(Boolean(confirmItem));

  const handleSetViewMode = (mode: 'poster' | 'list') => {
    setViewMode(mode);
    try {
      localStorage.setItem('lune_view_mode', mode);
    } catch {
      // ignore storage errors
    }
  };

  // Requests list state
  const [requests, setRequests] = useState<MediaRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsErr, setRequestsErr] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState('');

  const searchAbortRef = useRef<AbortController | null>(null);

  // Debounce search query by 300ms
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Fetch discover results
  const loadDiscover = useCallback(
    async (targetPage: number, append: boolean) => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      if (append) {
        setLoadingMore(true);
      } else {
        setDiscoverLoading(true);
      }
      setDiscoverErr('');

      try {
        const res = await api.discoverRequests(
          {
            tab: debouncedQuery ? undefined : discoverTab,
            q: debouncedQuery || undefined,
            page: targetPage,
            ...(debouncedQuery
              ? {}
              : {
                  sort: sort !== 'popularity' ? sort : undefined,
                  genre: genre > 0 ? genre : undefined,
                  year: !dateFrom && !dateTo && year > 0 ? year : undefined,
                  date_from: dateFrom || undefined,
                  date_to: dateTo || undefined,
                  min_rating: minRating > 0 ? minRating : undefined,
                  language: discoverTab !== 'anime' && language ? language : undefined,
                }),
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const results = Array.isArray(res.results) ? res.results : [];
        setPage(res.page || targetPage);
        setTotalPages(res.total_pages || 1);
        setDiscoverItems((prev) => (append ? [...prev, ...results] : results));
      } catch (err) {
        if (controller.signal.aborted) return;
        setDiscoverErr(err instanceof ApiError ? err.message : 'Unable to load titles right now.');
      } finally {
        if (!controller.signal.aborted) {
          setDiscoverLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [discoverTab, debouncedQuery, sort, genre, year, dateFrom, dateTo, minRating, language],
  );

  useEffect(() => {
    if (activeTab !== 'discover') return;
    setPosterBatches(1);
    loadDiscover(1, false);
    return () => {
      searchAbortRef.current?.abort();
    };
  }, [activeTab, loadDiscover]);

  // Top up the buffer automatically when a full batch needs one more TMDB page.
  useEffect(() => {
    if (
      activeTab !== 'discover' ||
      viewMode !== 'poster' ||
      discoverLoading ||
      loadingMore ||
      discoverErr ||
      posterGridCols <= 1 ||
      page >= totalPages
    ) {
      return;
    }
    if (filteredDiscoverItems.length < targetPosterCount) {
      loadDiscover(page + 1, true);
    }
  }, [
    activeTab,
    viewMode,
    discoverLoading,
    loadingMore,
    discoverErr,
    posterGridCols,
    page,
    totalPages,
    filteredDiscoverItems.length,
    targetPosterCount,
    loadDiscover,
  ]);

  // Fetch requests list
  const loadRequests = useCallback(
    async (scope: 'mine' | 'all', signal?: AbortSignal) => {
      setRequestsLoading(true);
      setRequestsErr('');
      try {
        const res = await api.listRequests({ scope, limit: 100 }, signal);
        if (signal?.aborted) return;
        setRequests(Array.isArray(res.requests) ? res.requests : []);
        setPendingCount(res.pending_count ?? 0);
      } catch (err) {
        if (signal?.aborted) return;
        setRequestsErr(err instanceof ApiError ? err.message : 'Failed to load requests.');
      } finally {
        if (!signal?.aborted) setRequestsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (activeTab === 'discover') {
      // Lightweight pending count refresh for admins
      if (isAdmin) {
        api
          .listRequests({ scope: 'all', status: 'pending', limit: 1 })
          .then((res) => setPendingCount(res.pending_count))
          .catch(() => {});
      }
      return;
    }
    const controller = new AbortController();
    loadRequests(activeTab === 'all' ? 'all' : 'mine', controller.signal);
    return () => controller.abort();
  }, [activeTab, isAdmin, loadRequests]);

  // Escape key closes confirm modal
  useEffect(() => {
    if (!confirmItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        setConfirmItem(null);
        setSubmitErr('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmItem, submitting]);

  async function handleSubmitRequest() {
    if (!confirmItem || submitting) return;
    setSubmitting(true);
    setSubmitErr('');
    try {
      const created = await api.createRequest({
        media_type: confirmItem.media_type,
        tmdb_id: confirmItem.tmdb_id,
        is_anime: confirmItem.is_anime,
      });
      setDiscoverItems((prev) =>
        prev.map((it) =>
          it.tmdb_id === confirmItem.tmdb_id && it.media_type === confirmItem.media_type
            ? { ...it, request_id: created.id, request_status: created.status }
            : it,
        ),
      );
      setConfirmItem(null);
    } catch (err) {
      setSubmitErr(err instanceof ApiError ? err.message : 'Could not submit request.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelRequest(req: MediaRequest) {
    setBusyId(req.id);
    setRequestsErr('');
    try {
      await api.deleteRequest(req.id);
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      if (req.status === 'pending') {
        setPendingCount((c) => Math.max(0, c - 1));
      }
      setDiscoverItems((prev) =>
        prev.map((it) =>
          it.request_id === req.id ? { ...it, request_id: undefined, request_status: '' } : it,
        ),
      );
    } catch (err) {
      setRequestsErr(err instanceof ApiError ? err.message : 'Failed to cancel request.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleApprove(req: MediaRequest) {
    setBusyId(req.id);
    setRequestsErr('');
    try {
      const updated = await api.adminApproveRequest(req.id);
      setRequests((prev) => prev.map((r) => (r.id === req.id ? updated : r)));
      if (req.status === 'pending') {
        setPendingCount((c) => Math.max(0, c - 1));
      }
    } catch (err) {
      setRequestsErr(err instanceof ApiError ? err.message : 'Failed to approve request.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(req: MediaRequest) {
    setBusyId(req.id);
    setRequestsErr('');
    try {
      const updated = await api.adminDeclineRequest(req.id, declineNote.trim() || undefined);
      setRequests((prev) => prev.map((r) => (r.id === req.id ? updated : r)));
      if (req.status === 'pending') {
        setPendingCount((c) => Math.max(0, c - 1));
      }
      setDecliningId(null);
      setDeclineNote('');
    } catch (err) {
      setRequestsErr(err instanceof ApiError ? err.message : 'Failed to decline request.');
    } finally {
      setBusyId(null);
    }
  }

  function handleOpenLibraryItem(item: DiscoverItem) {
    if (item.media_type === 'tv' && item.library_id && item.library_series_title) {
      onSelectSeries(item.library_id, item.library_series_title);
    } else if (item.library_item_id) {
      onSelectItem(item.library_item_id);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-tone/[0.08]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface border border-tone/10 flex items-center justify-center text-ink">
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-ink tracking-tight">Requests</h1>
            <p className="text-xs text-ink-secondary mt-0.5">
              Request a title to be added to this server and track its status.
            </p>
          </div>
        </div>

        {/* Segmented Tabs */}
        <div
          role="tablist"
          aria-label="Requests sections"
          className="inline-flex items-center rounded-lg bg-surface border border-hairline p-0.5 text-xs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'discover'}
            onClick={() => setActiveTab('discover')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              activeTab === 'discover'
                ? 'bg-tone/12 text-ink'
                : 'text-ink-secondary hover:text-ink'
            }`}
          >
            Discover
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'mine'}
            onClick={() => setActiveTab('mine')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              activeTab === 'mine'
                ? 'bg-tone/12 text-ink'
                : 'text-ink-secondary hover:text-ink'
            }`}
          >
            My Requests
          </button>
          {isAdmin && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'all'}
              onClick={() => setActiveTab('all')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-tone/12 text-ink'
                  : 'text-ink-secondary hover:text-ink'
              }`}
            >
              All Requests
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-warning/15 text-warning text-[10px] font-semibold tabular-nums">
                  {pendingCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Discover Tab */}
      {activeTab === 'discover' && (
        <div className="space-y-6">
          {/* Search + Category Pills */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search movies, TV shows, or anime to request…"
                className="w-full rounded-xl bg-surface border border-hairline pl-10 pr-4 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/40 transition-colors"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {DISCOVER_CATEGORIES.map((cat) => {
                  const isSelected = !debouncedQuery && discoverTab === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleSelectDiscoverTab(cat.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border ${
                        isSelected
                          ? 'bg-accent text-on-accent border-accent font-semibold'
                          : 'bg-surface border-hairline text-ink-secondary hover:text-ink hover:border-tone/25'
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>

              <div
                role="group"
                aria-label="View mode"
                className="inline-flex items-center rounded-lg bg-surface border border-hairline p-0.5 shrink-0"
              >
                <button
                  type="button"
                  title="Poster view"
                  aria-label="Poster view"
                  aria-pressed={viewMode === 'poster'}
                  onClick={() => handleSetViewMode('poster')}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    viewMode === 'poster'
                      ? 'bg-elevated text-ink'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="List view"
                  aria-label="List view"
                  aria-pressed={viewMode === 'list'}
                  onClick={() => handleSetViewMode('list')}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-elevated text-ink'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Seerr-style Discover Filter Bar */}
          <div className="rounded-xl bg-surface/60 border border-tone/[0.08] px-3.5 py-2.5 flex flex-wrap items-center gap-2">
            {!debouncedQuery && (
              <>
                <select
                  aria-label="Sort titles"
                  value={sort}
                  onChange={(e) => handleSortChange(e.target.value as DiscoverSort)}
                  className={`h-8 rounded-lg border px-2.5 text-xs tabular-nums transition-colors focus:outline-none cursor-pointer ${
                    sort !== 'popularity'
                      ? 'bg-tone/12 border-tone/35 text-ink font-medium'
                      : 'bg-surface border-hairline text-ink-secondary hover:text-ink hover:border-tone/25'
                  }`}
                >
                  <option value="popularity">Most Popular</option>
                  <option value="rating">Top Rated</option>
                  <option value="newest">Newest</option>
                  <option value="upcoming">Upcoming</option>
                </select>

                <select
                  aria-label="Filter by genre"
                  value={genre > 0 ? String(genre) : ''}
                  onChange={(e) => handleGenreChange(e.target.value ? Number(e.target.value) : 0)}
                  className={`h-8 rounded-lg border px-2.5 text-xs tabular-nums transition-colors focus:outline-none cursor-pointer ${
                    genre > 0
                      ? 'bg-tone/12 border-tone/35 text-ink font-medium'
                      : 'bg-surface border-hairline text-ink-secondary hover:text-ink hover:border-tone/25'
                  }`}
                >
                  <option value="">All Genres</option>
                  {availableGenres.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>

                <div ref={datePopoverRef} className="relative">
                  <button
                    type="button"
                    aria-label="Filter by release date or year"
                    aria-expanded={datePopoverOpen}
                    onClick={() => setDatePopoverOpen((v) => !v)}
                    className={`h-8 inline-flex items-center gap-1.5 rounded-lg border px-2.5 text-xs tabular-nums transition-colors cursor-pointer ${
                      year > 0 || dateFrom !== '' || dateTo !== ''
                        ? 'bg-tone/12 border-tone/35 text-ink font-medium'
                        : 'bg-surface border-hairline text-ink-secondary hover:text-ink hover:border-tone/25'
                    }`}
                  >
                    <span>{dateFilterLabel}</span>
                    <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
                  </button>

                  {datePopoverOpen && (
                    <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 sm:translate-y-0 sm:inset-x-auto sm:absolute sm:left-0 sm:top-full sm:mt-1.5 z-50 sm:z-30 sm:w-72 rounded-xl bg-surface/95 backdrop-blur-xl border border-tone/15 shadow-2xl p-3.5 space-y-3">
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                          Calendar Timeframe
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="block text-[10px] text-ink-secondary mb-1">From</span>
                            <input
                              type="date"
                              aria-label="Release date from"
                              value={dateFrom}
                              max={dateTo || undefined}
                              onChange={(e) => handleDateRangeChange(e.target.value, dateTo)}
                              className="w-full rounded-lg bg-canvas border border-hairline px-2 py-1.5 text-[11px] tabular-nums text-ink focus:outline-none focus:border-tone/40"
                            />
                          </div>
                          <div>
                            <span className="block text-[10px] text-ink-secondary mb-1">To</span>
                            <input
                              type="date"
                              aria-label="Release date to"
                              value={dateTo}
                              min={dateFrom || undefined}
                              onChange={(e) => handleDateRangeChange(dateFrom, e.target.value)}
                              className="w-full rounded-lg bg-canvas border border-hairline px-2 py-1.5 text-[11px] tabular-nums text-ink focus:outline-none focus:border-tone/40"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                          Or Single Year
                        </label>
                        <select
                          aria-label="Filter by year"
                          value={year > 0 ? String(year) : ''}
                          onChange={(e) => {
                            handleYearChange(e.target.value ? Number(e.target.value) : 0);
                            setDatePopoverOpen(false);
                          }}
                          className="w-full rounded-lg bg-canvas border border-hairline px-2.5 py-1.5 text-xs tabular-nums text-ink focus:outline-none focus:border-tone/40 cursor-pointer"
                        >
                          <option value="">Any year</option>
                          {DISCOVER_YEARS.map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-tone/[0.08]">
                        {(() => {
                          const now = new Date();
                          const yNow = now.getFullYear();
                          const todayISO = now.toISOString().slice(0, 10);
                          const d90 = new Date(now.getTime() - 90 * 86400_000).toISOString().slice(0, 10);
                          const presets: { label: string; from: string; to: string }[] = [
                            { label: 'Last 90d', from: d90, to: todayISO },
                            { label: `${yNow}`, from: `${yNow}-01-01`, to: `${yNow}-12-31` },
                            { label: '2020s', from: '2020-01-01', to: '2029-12-31' },
                            { label: '2010s', from: '2010-01-01', to: '2019-12-31' },
                          ];
                          return presets.map((p) => (
                            <button
                              key={p.label}
                              type="button"
                              onClick={() => {
                                handleDateRangeChange(p.from, p.to);
                                setDatePopoverOpen(false);
                              }}
                              className="px-2 py-1 rounded-md bg-canvas hover:bg-elevated border border-hairline text-[11px] tabular-nums text-ink-secondary hover:text-ink transition-colors cursor-pointer"
                            >
                              {p.label}
                            </button>
                          ));
                        })()}
                        {(year > 0 || dateFrom !== '' || dateTo !== '') && (
                          <button
                            type="button"
                            onClick={() => {
                              setYear(0);
                              setDateFrom('');
                              setDateTo('');
                              setDatePopoverOpen(false);
                            }}
                            className="ml-auto px-2 py-1 rounded-md text-[11px] text-ink-muted hover:text-ink transition-colors cursor-pointer"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <select
                  aria-label="Filter by minimum score"
                  value={minRating > 0 ? String(minRating) : ''}
                  onChange={(e) => handleMinRatingChange(e.target.value ? Number(e.target.value) : 0)}
                  className={`h-8 rounded-lg border px-2.5 text-xs tabular-nums transition-colors focus:outline-none cursor-pointer ${
                    minRating > 0
                      ? 'bg-tone/12 border-tone/35 text-ink font-medium'
                      : 'bg-surface border-hairline text-ink-secondary hover:text-ink hover:border-tone/25'
                  }`}
                >
                  <option value="">Any score</option>
                  <option value="6">6.0+</option>
                  <option value="7">7.0+</option>
                  <option value="8">8.0+</option>
                </select>

                {discoverTab !== 'anime' && (
                  <select
                    aria-label="Filter by language"
                    value={language}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    className={`h-8 rounded-lg border px-2.5 text-xs tabular-nums transition-colors focus:outline-none cursor-pointer ${
                      language !== ''
                        ? 'bg-tone/12 border-tone/35 text-ink font-medium'
                        : 'bg-surface border-hairline text-ink-secondary hover:text-ink hover:border-tone/25'
                    }`}
                  >
                    <option value="">Any language</option>
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}

            <button
              type="button"
              aria-pressed={availability === 'requestable'}
              onClick={() =>
                setAvailability((prev) => (prev === 'requestable' ? 'all' : 'requestable'))
              }
              className={`h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                availability === 'requestable'
                  ? 'bg-tone/12 border-tone/40 text-ink'
                  : 'bg-surface border-hairline text-ink-secondary hover:text-ink hover:border-tone/25'
              }`}
            >
              Not in Library
            </button>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-ink-secondary hover:text-ink hover:bg-elevated transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear</span>
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-tone/12 text-[10px] font-semibold tabular-nums text-ink">
                  {activeFilterCount}
                </span>
              </button>
            )}
          </div>

          {discoverErr && (
            <div className="rounded-xl bg-danger/10 border border-danger/30 px-4 py-3 text-xs text-danger">
              {discoverErr}
            </div>
          )}

          {discoverLoading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-xs text-ink-secondary">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading titles…
            </div>
          ) : filteredDiscoverItems.length === 0 ? (
            <div className="rounded-2xl bg-surface/60 border border-tone/[0.08] p-12 text-center space-y-2.5">
              <div className="text-sm font-medium text-ink">No titles found</div>
              <p className="text-xs text-ink-secondary">
                {discoverItems.length > 0 && availability === 'requestable'
                  ? 'Every title loaded so far is already in your library.'
                  : debouncedQuery
                    ? `No results matched “${debouncedQuery}”. Try another title or spelling.`
                    : activeFilterCount > 0
                      ? 'No titles match the current filters.'
                      : 'No titles are available in this category right now.'}
              </p>
              {(activeFilterCount > 0 || (discoverItems.length > 0 && page < totalPages)) && (
                <div className="flex items-center justify-center gap-2 pt-1">
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="rounded-lg bg-elevated hover:bg-hairline text-xs font-medium text-ink px-3.5 py-1.5 transition-colors cursor-pointer"
                    >
                      Clear filters
                    </button>
                  )}
                  {discoverItems.length > 0 && page < totalPages && (
                    <button
                      type="button"
                      disabled={loadingMore}
                      onClick={() => loadDiscover(page + 1, true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-surface hover:bg-elevated border border-hairline px-3.5 py-1.5 text-xs font-medium text-ink transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {loadingMore ? 'Loading more…' : 'Load more'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {viewMode === 'list' ? (
                <div className="flex flex-col gap-2">
                  {filteredDiscoverItems.map((item) => {
                    const key = `${item.media_type}:${item.tmdb_id}`;
                    const typeLabel = mediaTypeLabel(item.media_type, item.is_anime);
                    const canNavigate =
                      item.in_library &&
                      Boolean(
                        (item.media_type === 'tv' &&
                          item.library_id &&
                          item.library_series_title) ||
                          item.library_item_id,
                      );

                    return (
                      <div
                        key={key}
                        className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 rounded-xl bg-surface/60 hover:bg-elevated/70 border border-tone/[0.08] px-3 sm:px-3.5 py-2.5 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (canNavigate) {
                              handleOpenLibraryItem(item);
                            } else if (!item.in_library && !item.request_status) {
                              setSubmitErr('');
                              setConfirmItem(item);
                            }
                          }}
                          className={`w-12 h-[72px] rounded-lg overflow-hidden bg-elevated shrink-0 flex items-center justify-center ${
                            canNavigate || (!item.in_library && !item.request_status)
                              ? 'cursor-pointer'
                              : 'cursor-default'
                          }`}
                        >
                          {item.poster_url ? (
                            <img
                              src={item.poster_url}
                              alt={item.title}
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <LuneMark alt="" className="w-5 h-5 opacity-30" />
                          )}
                        </button>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-ink truncate">
                              {item.title}
                            </span>
                            <span className="text-xs text-ink-secondary tabular-nums">
                              {item.year ?? 'TBA'}
                            </span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-elevated border border-tone/[0.08] text-[10px] font-medium text-ink-secondary">
                              {item.is_anime ? (
                                <Sparkles className="w-2.5 h-2.5 text-telemetry" />
                              ) : item.media_type === 'movie' ? (
                                <Film className="w-2.5 h-2.5" />
                              ) : (
                                <Tv className="w-2.5 h-2.5" />
                              )}
                              {typeLabel}
                            </span>
                            {item.rating != null && item.rating > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-ink-secondary">
                                <Star className="w-3 h-3 text-warning fill-current" />
                                {item.rating.toFixed(1)}
                              </span>
                            )}
                          </div>
                          {item.overview && (
                            <p className="text-xs text-ink-secondary line-clamp-2 leading-relaxed">
                              {item.overview}
                            </p>
                          )}
                        </div>

                        <div className="shrink-0">
                          {item.in_library ? (
                            <button
                              type="button"
                              disabled={!canNavigate}
                              onClick={() => handleOpenLibraryItem(item)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-healthy/15 hover:bg-healthy/25 border border-healthy/30 text-healthy text-xs font-semibold py-1.5 px-3 transition-colors cursor-pointer disabled:cursor-default"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Available
                            </button>
                          ) : item.request_status ? (
                            <StatusBadge status={item.request_status} />
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSubmitErr('');
                                setConfirmItem(item);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold py-1.5 px-3 transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Request
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div ref={setPosterGridEl} className="lune-poster-grid">
                {visiblePosterItems.map((item) => {
                  const key = `${item.media_type}:${item.tmdb_id}`;
                  const typeLabel = mediaTypeLabel(item.media_type, item.is_anime);
                  const canNavigate =
                    item.in_library &&
                    Boolean(
                      (item.media_type === 'tv' && item.library_id && item.library_series_title) ||
                        item.library_item_id,
                    );

                  return (
                    <div
                      key={key}
                      className="group flex flex-col rounded-xl bg-surface border border-tone/[0.08] hover:border-tone/25 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(0,0,0,0.22)]"
                    >
                      {/* Poster */}
                      <div
                        onClick={() => {
                          if (canNavigate) {
                            handleOpenLibraryItem(item);
                          } else if (!item.in_library && !item.request_status) {
                            setSubmitErr('');
                            setConfirmItem(item);
                          }
                        }}
                        className={`relative aspect-[2/3] w-full bg-gradient-to-br from-elevated via-surface to-canvas overflow-hidden ${
                          canNavigate || (!item.in_library && !item.request_status)
                            ? 'cursor-pointer'
                            : ''
                        }`}
                      >
                        {item.poster_url ? (
                          <img
                            src={item.poster_url}
                            alt={item.title}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-5 text-center">
                            <LuneMark alt="" className="w-10 h-10 opacity-30 mb-3" />
                            <span className="text-xs font-medium text-ink-secondary line-clamp-3">
                              {item.title}
                            </span>
                          </div>
                        )}

                        {/* Media type pill */}
                        <div className="absolute top-2.5 left-2.5 flex items-center gap-1">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/65 backdrop-blur-md border border-white/15 text-[10px] font-semibold tracking-wide text-white">
                            {item.is_anime ? (
                              <Sparkles className="w-2.5 h-2.5 text-[#64D2FF]" />
                            ) : item.media_type === 'movie' ? (
                              <Film className="w-2.5 h-2.5" />
                            ) : (
                              <Tv className="w-2.5 h-2.5" />
                            )}
                            {typeLabel}
                          </span>
                        </div>

                        {/* Rating pill */}
                        {item.rating != null && item.rating > 0 && (
                          <div className="absolute top-2.5 right-2.5">
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/65 backdrop-blur-md border border-white/15 tabular-nums text-[10px] font-semibold text-white">
                              <Star className="w-2.5 h-2.5 text-warning fill-current" />
                              {item.rating.toFixed(1)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Metadata + Action */}
                      <div className="p-3 flex flex-col flex-1 justify-between gap-2.5">
                        <div>
                          <div className="text-sm font-medium tracking-[-0.01em] text-ink truncate">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-ink-secondary tabular-nums mt-0.5">
                            {item.year ?? 'TBA'}
                          </div>
                        </div>

                        {item.in_library ? (
                          <button
                            type="button"
                            disabled={!canNavigate}
                            onClick={() => handleOpenLibraryItem(item)}
                            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-healthy/15 hover:bg-healthy/25 border border-healthy/30 text-healthy text-xs font-semibold py-1.5 px-2.5 transition-colors cursor-pointer disabled:cursor-default"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Available
                          </button>
                        ) : item.request_status ? (
                          <div className="flex items-center justify-center py-0.5">
                            <StatusBadge status={item.request_status} />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSubmitErr('');
                              setConfirmItem(item);
                            }}
                            className="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold py-1.5 px-2.5 transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Request
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              )}

              {(page < totalPages ||
                (viewMode === 'poster' && visiblePosterItems.length < filteredDiscoverItems.length)) && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => {
                      if (viewMode === 'poster' && posterGridCols > 1) {
                        setPosterBatches((b) => b + 1);
                      } else {
                        loadDiscover(page + 1, true);
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-surface hover:bg-elevated border border-hairline px-5 py-2.5 text-xs font-medium text-ink transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {loadingMore ? 'Loading more…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* My Requests / All Requests Tab */}
      {(activeTab === 'mine' || activeTab === 'all') && (
        <div className="space-y-4">
          {requestsErr && (
            <div className="rounded-xl bg-danger/10 border border-danger/30 px-4 py-3 text-xs text-danger">
              {requestsErr}
            </div>
          )}

          {requestsLoading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-xs text-ink-secondary">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading requests…
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-2xl bg-surface/60 border border-tone/[0.08] p-12 text-center space-y-3">
              <div className="text-sm font-medium text-ink">
                {activeTab === 'all' ? 'No requests yet' : 'You have not requested any titles yet'}
              </div>
              <p className="text-xs text-ink-secondary max-w-sm mx-auto">
                Browse trending titles or search for a movie, show, or anime to request it for this server.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('discover')}
                className="rounded-lg bg-accent hover:bg-accent-hover text-on-accent font-semibold text-xs px-4 py-2 transition-colors cursor-pointer"
              >
                Explore Discover
              </button>
            </div>
          ) : (
            <div className="rounded-xl bg-surface border border-tone/[0.08] divide-y divide-tone/[0.08]">
              {requests.map((req) => {
                const isOwnPending = req.user_id === currentUserId && req.status === 'pending';
                const isBusy = busyId === req.id;
                const isDeclining = decliningId === req.id;

                return (
                  <div key={req.id} className="p-4 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div className="w-11 shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-elevated border border-tone/[0.08] flex items-center justify-center">
                          {req.poster_url ? (
                            <img
                              src={req.poster_url}
                              alt={req.title}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <LuneMark alt="" className="w-5 h-5 opacity-30" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-ink truncate">
                              {req.title}
                            </span>
                            {req.year && (
                              <span className="text-xs tabular-nums text-ink-muted">{req.year}</span>
                            )}
                            <span className="px-2 py-0.5 rounded-full bg-elevated text-[10px] font-medium text-ink-secondary">
                              {mediaTypeLabel(req.media_type, req.is_anime)}
                            </span>
                            <StatusBadge status={req.status} />
                          </div>

                          <div className="text-[11px] text-ink-secondary mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums">
                            {activeTab === 'all' && (
                              <span>
                                Requested by <span className="text-ink">{req.display_name || req.username}</span>
                              </span>
                            )}
                            <span className="text-ink-muted">
                              {formatRelativeDate(req.created_at)}
                            </span>
                          </div>

                          {req.status_note && (
                            <p className="text-xs text-ink-secondary mt-1.5 bg-canvas/60 border border-tone/[0.06] rounded-lg px-2.5 py-1.5">
                              {req.status_note}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isAdmin && req.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleApprove(req)}
                              className="inline-flex items-center gap-1 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent font-semibold text-xs px-3 py-1.5 transition-colors cursor-pointer"
                            >
                              {isBusy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setDecliningId(isDeclining ? null : req.id);
                                setDeclineNote('');
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-canvas border border-hairline hover:border-danger/50 text-xs text-ink-secondary hover:text-danger px-3 py-1.5 transition-colors cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              Decline
                            </button>
                          </>
                        )}

                        {isOwnPending && !isAdmin && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleCancelRequest(req)}
                            className="inline-flex items-center gap-1 rounded-lg bg-canvas border border-hairline hover:border-danger/50 text-xs text-ink-secondary hover:text-danger px-3 py-1.5 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <X className="w-3.5 h-3.5" />
                            )}
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>

                    {isAdmin && isDeclining && (
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-tone/[0.06]">
                        <input
                          type="text"
                          value={declineNote}
                          onChange={(e) => setDeclineNote(e.target.value)}
                          placeholder="Optional reason for declining…"
                          className="flex-1 min-w-[200px] rounded-lg bg-canvas border border-hairline px-3 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/40"
                        />
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDecline(req)}
                          className="rounded-lg bg-danger hover:bg-danger/90 text-white font-semibold text-xs px-3 py-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Confirm Decline
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDecliningId(null);
                            setDeclineNote('');
                          }}
                          className="rounded-lg bg-elevated text-xs text-ink-secondary hover:text-ink px-3 py-1.5 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Frosted Request Confirmation Modal */}
      {confirmItem && (
        <div
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => {
            if (!submitting) {
              setConfirmItem(null);
              setSubmitErr('');
            }
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl bg-surface/92 backdrop-blur-xl backdrop-saturate-150 border border-tone/12 shadow-2xl"
          >
            <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3.5 sm:pb-4 border-b border-tone/[0.08] flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  Request Title
                </div>
                <h2 className="text-base font-semibold text-ink mt-0.5">{confirmItem.title}</h2>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setConfirmItem(null);
                  setSubmitErr('');
                }}
                aria-label="Close request modal"
                className="p-1.5 rounded-lg text-ink-secondary hover:text-ink hover:bg-elevated transition-colors cursor-pointer disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-5">
              <div className="flex gap-4 items-start">
                <div className="w-24 shrink-0 aspect-[2/3] rounded-xl overflow-hidden bg-elevated border border-tone/[0.08] flex items-center justify-center">
                  {confirmItem.poster_url ? (
                    <img
                      src={confirmItem.poster_url}
                      alt={confirmItem.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <LuneMark alt="" className="w-8 h-8 opacity-30" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums text-ink-secondary">
                    <span className="px-2 py-0.5 rounded-full bg-elevated text-[11px] font-medium text-ink">
                      {mediaTypeLabel(confirmItem.media_type, confirmItem.is_anime)}
                    </span>
                    {confirmItem.year && <span>{confirmItem.year}</span>}
                    {confirmItem.rating != null && confirmItem.rating > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-warning">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        {confirmItem.rating.toFixed(1)}
                      </span>
                    )}
                  </div>

                  {confirmItem.original_title && confirmItem.original_title !== confirmItem.title && (
                    <div className="text-xs text-ink-muted truncate">{confirmItem.original_title}</div>
                  )}

                  {confirmItem.overview ? (
                    <p className="text-xs leading-relaxed text-ink-secondary line-clamp-5">
                      {confirmItem.overview}
                    </p>
                  ) : (
                    <p className="text-xs text-ink-muted italic">No synopsis available.</p>
                  )}
                </div>
              </div>

              {submitErr && (
                <div className="rounded-lg bg-danger/10 border border-danger/30 px-3.5 py-2.5 text-xs text-danger">
                  {submitErr}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setConfirmItem(null);
                    setSubmitErr('');
                  }}
                  className="rounded-lg bg-elevated hover:bg-hairline text-xs font-medium text-ink px-4 py-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmitRequest}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent font-semibold text-xs px-4 py-2 transition-colors cursor-pointer"
                >
                  {submitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Submit Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
