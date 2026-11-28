import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Play,
  RotateCcw,
  Check,
  Volume2,
  Subtitles,
  RefreshCw,
  Bookmark,
  BookmarkCheck,
  Heart,
  ExternalLink,
  Languages,
  Settings,
  Search,
  MoreHorizontal,
  Download,
  Link2,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Trash2,
} from 'lucide-react';
import {
  api,
  formatDuration,
  formatTimeLeft,
  formatResolution,
  type AudioTrack,
  type ChapterInfo,
  type DiscoverFilter,
  type MediaItemDetail,
  type MediaItemSummary,
  type MetadataSearchResult,
  type PlaybackLaunchOptions,
  type SeriesDetail,
  type SeriesSummary,
  type SimilarMediaResponse,
} from '../lib/api';
import { viewCache } from '../lib/cache';
import { CastShelf } from './CastShelf';
import { IdentifyModal } from './IdentifyModal';
import { LuneMark } from './LuneMark';
import { MediaCard } from './MediaCard';
import { MediaInfoModal } from './MediaInfoModal';
import { MediaShelf, SHELF_CARD_CLASS } from './MediaShelf';
import { SeriesCard } from './SeriesCard';

interface Props {
  itemId: string;
  initialItem?: MediaItemSummary;
  isAdmin?: boolean;
  refreshKey?: number;
  backLabel: string;
  onBack: () => void;
  onPlay: (item: MediaItemSummary, opts?: PlaybackLaunchOptions) => void;
  onSelectItem: (item: MediaItemSummary) => void;
  onSelectSeries: (libraryId: string, title: string, initialSeries?: SeriesSummary) => void;
  onDiscover: (filter: DiscoverFilter) => void;
  onMetadataUpdated: () => void;
}

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  ja: 'Japanese',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  ko: 'Korean',
  pt: 'Portuguese',
  zh: 'Chinese',
  ru: 'Russian',
  ar: 'Arabic',
  und: 'Unknown',
};

function formatAudioTrackLabel(tr: AudioTrack): string {
  const lang = LANG_NAMES[(tr.language ?? '').toLowerCase()] || (tr.language ? tr.language.toUpperCase() : 'Track');
  const layout =
    tr.channel_layout ||
    (tr.channels === 2 ? 'Stereo' : tr.channels === 6 ? '5.1' : tr.channels === 8 ? '7.1' : tr.channels ? `${tr.channels}ch` : '');
  const parts = [lang, tr.codec.toUpperCase(), layout].filter(Boolean);
  if (tr.title && !tr.title.toLowerCase().includes(lang.toLowerCase())) {
    parts.push(tr.title);
  }
  if (tr.default) parts.push('Default');
  return parts.join(' · ');
}

function formatReleaseDate(raw?: string): string {
  if (!raw) return '';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatChapterTimecode(ms: number): string {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatChapterKindBadge(kind: ChapterInfo['kind']): string | null {
  switch (kind) {
    case 'intro':
      return 'OP';
    case 'outro':
      return 'ED';
    case 'recap':
      return 'RECAP';
    case 'preview':
      return 'PREVIEW';
    default:
      return null;
  }
}

function ChapterCard({
  chapter,
  bustSuffix,
  onSelect,
}: {
  chapter: ChapterInfo;
  bustSuffix: string;
  onSelect: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  // Server still URLs already carry ?v=<mtime>; join any extra bust param with '&'.
  const src = chapter.thumbnail_url
    ? `${chapter.thumbnail_url}${bustSuffix && chapter.thumbnail_url.includes('?') ? bustSuffix.replace('?', '&') : bustSuffix}`
    : '';
  const showImage = Boolean(src) && !imgError;
  const timecode = formatChapterTimecode(chapter.start_ms);
  const kindBadge = formatChapterKindBadge(chapter.kind);
  const title = chapter.title || `Chapter ${chapter.index + 1}`;

  useEffect(() => {
    setImgError(false);
  }, [src]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group w-[228px] sm:w-[252px] shrink-0 snap-start text-left flex flex-col rounded-xl bg-surface border border-tone/[0.08] hover:border-tone/25 hover:-translate-y-0.5 overflow-hidden transition-all duration-200 cursor-pointer"
    >
      <div className="relative aspect-video w-full bg-gradient-to-br from-elevated via-surface to-canvas overflow-hidden">
        {showImage ? (
          <>
            <img
              src={src}
              alt={title}
              loading="lazy"
              decoding="async"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
            <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[10px] font-medium text-white tabular-nums">
              {timecode}
            </span>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-canvas/70 text-ink-secondary">
            <Play className="w-4 h-4 fill-current opacity-60 group-hover:opacity-100 transition-opacity" />
            <span className="text-xs font-medium tabular-nums text-ink">{timecode}</span>
          </div>
        )}
        {kindBadge && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm border border-white/12 text-[10px] font-semibold tracking-wider text-telemetry">
            {kindBadge}
          </span>
        )}
      </div>
      <div className="p-2.5">
        <div className="text-xs font-medium text-ink truncate">{title}</div>
      </div>
    </button>
  );
}

export function ItemDetailPage({
  itemId,
  initialItem,
  isAdmin = false,
  refreshKey = 0,
  backLabel,
  onBack,
  onPlay,
  onSelectItem,
  onSelectSeries,
  onDiscover,
  onMetadataUpdated,
}: Props) {
  const cachedDetail = viewCache.getItemDetail(itemId) ?? null;
  const [detail, setDetail] = useState<MediaItemDetail | null>(cachedDetail);
  const [seriesDetail, setSeriesDetail] = useState<SeriesDetail | null>(() => {
    const libId = cachedDetail?.library_id || initialItem?.library_id || '';
    const sTitle = cachedDetail?.series_title || initialItem?.series_title || '';
    return libId && sTitle ? viewCache.getSeriesDetail(libId, sTitle) ?? null : null;
  });
  const [similar, setSimilar] = useState<SimilarMediaResponse | null>(
    () => viewCache.getItemSimilar(itemId) ?? null,
  );
  const [loading, setLoading] = useState(!cachedDetail && !initialItem);
  const [error, setError] = useState('');

  // Pre-play track selections
  const [selectedAudioIdx, setSelectedAudioIdx] = useState<number | undefined>(
    () => cachedDetail?.selected_audio_index ?? cachedDetail?.audio_tracks?.[0]?.index,
  );
  const [selectedSubIdx, setSelectedSubIdx] = useState<number | null>(() =>
    cachedDetail?.selected_subtitle_index !== undefined ? cachedDetail.selected_subtitle_index : null,
  );

  // Menus & modals
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showMediaInfo, setShowMediaInfo] = useState(false);
  const [showRematch, setShowRematch] = useState(false);
  const [copiedStreamURL, setCopiedStreamURL] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [artBust, setArtBust] = useState(0);

  const [refreshing, setRefreshing] = useState(false);
  const [togglingMark, setTogglingMark] = useState<'watchlist' | 'favorite' | 'watched' | null>(null);

  const moreMenuRef = useRef<HTMLDivElement>(null);
  const adminMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cached = viewCache.getItemDetail(itemId) ?? null;
    const cachedSim = viewCache.getItemSimilar(itemId) ?? null;
    const libId = cached?.library_id || initialItem?.library_id || '';
    const sTitle = cached?.series_title || initialItem?.series_title || '';
    setDetail(cached);
    setSeriesDetail(libId && sTitle ? viewCache.getSeriesDetail(libId, sTitle) ?? null : null);
    setSimilar(cachedSim);
    setLoading(!cached && !initialItem);
    setError('');
    if (cached) {
      setSelectedAudioIdx(cached.selected_audio_index ?? cached.audio_tracks?.[0]?.index);
      setSelectedSubIdx(
        cached.selected_subtitle_index !== undefined ? cached.selected_subtitle_index : null,
      );
    }
    setShowMoreMenu(false);
    setShowAdminMenu(false);
    setShowMediaInfo(false);
    setShowRematch(false);
    setCopiedStreamURL(false);
  }, [itemId, initialItem]);

  useEffect(() => {
    if (!showAdminMenu && !showMoreMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      if (showAdminMenu && adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) {
        setShowAdminMenu(false);
      }
      if (showMoreMenu && moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAdminMenu(false);
        setShowMoreMenu(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showAdminMenu, showMoreMenu]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const force = refreshKey > 0;

    if (!force && viewCache.isItemDetailFresh(itemId)) {
      setLoading(false);
    } else {
      api
        .getItem(itemId, controller.signal)
        .then((d) => {
          if (!active) return;
          viewCache.setItemDetail(itemId, d);
          setDetail(d);
          setSelectedAudioIdx(d.selected_audio_index ?? d.audio_tracks?.[0]?.index);
          setSelectedSubIdx(
            d.selected_subtitle_index !== undefined ? d.selected_subtitle_index : null,
          );
        })
        .catch((err) => {
          if (active && !controller.signal.aborted) {
            setError(err instanceof Error ? err.message : 'Unable to load item');
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    if (force || !viewCache.isItemSimilarFresh(itemId)) {
      api
        .getSimilarItems(itemId, 12, controller.signal)
        .then((res) => {
          if (!active) return;
          viewCache.setItemSimilar(itemId, res);
          setSimilar(res);
        })
        .catch(() => {});
    }

    return () => {
      active = false;
      controller.abort();
    };
  }, [itemId, refreshKey]);

  // For episode pages, fetch sibling episodes in the same season for Prev/Next & "More from Season X"
  const activeSeriesTitle = detail?.series_title || initialItem?.series_title || '';
  const activeLibraryId = detail?.library_id || initialItem?.library_id || '';
  useEffect(() => {
    if (!activeSeriesTitle || !activeLibraryId) {
      setSeriesDetail(null);
      return;
    }
    const cached = viewCache.getSeriesDetail(activeLibraryId, activeSeriesTitle);
    if (cached) {
      setSeriesDetail(cached);
    }
    if (refreshKey === 0 && viewCache.isSeriesDetailFresh(activeLibraryId, activeSeriesTitle)) {
      return;
    }
    const controller = new AbortController();
    let active = true;
    api
      .getSeriesDetail(activeLibraryId, activeSeriesTitle, controller.signal)
      .then((sd) => {
        if (!active) return;
        viewCache.setSeriesDetail(activeLibraryId, activeSeriesTitle, sd);
        setSeriesDetail(sd);
      })
      .catch(() => {});
    return () => {
      active = false;
      controller.abort();
    };
  }, [activeLibraryId, activeSeriesTitle, refreshKey]);

  const { currentSeason, prevEpisode, nextEpisode } = useMemo(() => {
    if (!seriesDetail) {
      return { currentSeason: null, prevEpisode: null, nextEpisode: null };
    }
    const flat = seriesDetail.seasons.flatMap((s) => s.episodes);
    const idx = flat.findIndex((e) => e.item.id === itemId);
    const prev = idx > 0 ? flat[idx - 1].item : null;
    const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1].item : null;
    const season =
      seriesDetail.seasons.find((s) => s.episodes.some((e) => e.item.id === itemId)) ?? null;
    return { currentSeason: season, prevEpisode: prev, nextEpisode: next };
  }, [seriesDetail, itemId]);

  async function handleQuickRefresh() {
    setShowAdminMenu(false);
    setRefreshing(true);
    setError('');
    try {
      const updated = await api.refreshItem(itemId, {});
      viewCache.setItemDetail(itemId, updated);
      setDetail(updated);
      setArtBust(Date.now());
      onMetadataUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh metadata');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSelectIdentifyCandidate(candidate: MetadataSearchResult) {
    setRefreshing(true);
    setError('');
    try {
      const updated = await api.refreshItem(itemId, {
        title: candidate.title,
        year: candidate.year,
        tmdb_id: candidate.tmdb_id,
      });
      viewCache.setItemDetail(itemId, updated);
      setDetail(updated);
      setArtBust(Date.now());
      onMetadataUpdated();
    } finally {
      setRefreshing(false);
    }
  }

  async function toggleWatchlist() {
    if (!detail || togglingMark) return;
    setTogglingMark('watchlist');
    try {
      const next = detail.in_watchlist
        ? (await api.removeFromWatchlist(detail.id), { ...detail, in_watchlist: false })
        : (await api.addToWatchlist(detail.id), { ...detail, in_watchlist: true });
      viewCache.setItemDetail(detail.id, next);
      setDetail(next);
      onMetadataUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update watchlist');
    } finally {
      setTogglingMark(null);
    }
  }

  async function toggleFavorite() {
    if (!detail || togglingMark) return;
    setTogglingMark('favorite');
    try {
      const next = detail.is_favorite
        ? (await api.removeFromFavorites(detail.id), { ...detail, is_favorite: false })
        : (await api.addToFavorites(detail.id), { ...detail, is_favorite: true });
      viewCache.setItemDetail(detail.id, next);
      setDetail(next);
      onMetadataUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update favorite');
    } finally {
      setTogglingMark(null);
    }
  }

  async function toggleWatched() {
    if (!detail || togglingMark) return;
    setTogglingMark('watched');
    setShowMoreMenu(false);
    try {
      const currentlyWatched = Boolean(detail.progress?.completed);
      let next: MediaItemDetail;
      if (currentlyWatched) {
        await api.clearProgress(detail.id);
        next = { ...detail, progress: undefined };
      } else {
        const prog = await api.updateProgress(detail.id, detail.duration_ms || 1, true);
        next = { ...detail, progress: prog, in_watchlist: false };
      }
      viewCache.setItemDetail(detail.id, next);
      setDetail(next);
      onMetadataUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update watched state');
    } finally {
      setTogglingMark(null);
    }
  }

  async function handleClearResume() {
    if (!detail) return;
    setShowMoreMenu(false);
    try {
      await api.clearProgress(detail.id);
      const next = { ...detail, progress: undefined };
      viewCache.setItemDetail(detail.id, next);
      setDetail(next);
      onMetadataUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear resume position');
    }
  }

  async function handleDownloadOriginal() {
    if (!detail || busyAction) return;
    setBusyAction('download');
    setShowMoreMenu(false);
    try {
      const link = await api.createDirectLink(detail.id);
      const a = document.createElement('a');
      a.href = link.download_url;
      a.download = link.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start download');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCopyStreamURL() {
    if (!detail || busyAction) return;
    setBusyAction('copy');
    try {
      const link = await api.createDirectLink(detail.id);
      const fullURL = new URL(link.stream_url, window.location.origin).toString();
      await navigator.clipboard.writeText(fullURL);
      setCopiedStreamURL(true);
      window.setTimeout(() => {
        setCopiedStreamURL(false);
        setShowMoreMenu(false);
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy stream URL');
    } finally {
      setBusyAction(null);
    }
  }

  function launchPlayback(startOverrideMS?: number) {
    if (!activeItem) return;
    const selectedSub =
      selectedSubIdx !== null
        ? (detail?.subtitles ?? []).find((s) => s.index === selectedSubIdx)
        : undefined;
    const burnStreamIdx =
      selectedSub?.requires_burn_in && selectedSub.stream_index !== undefined
        ? selectedSub.stream_index
        : undefined;
    onPlay(activeItem, {
      ...(selectedAudioIdx !== undefined ? { audioStreamIndex: selectedAudioIdx } : {}),
      subtitleIndex: selectedSubIdx,
      ...(burnStreamIdx !== undefined ? { burnSubtitleStreamIndex: burnStreamIdx } : {}),
      ...(startOverrideMS !== undefined ? { startPositionMS: startOverrideMS } : {}),
    });
  }

  const activeItem = detail ?? initialItem;

  if (loading && !activeItem) {
    return (
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center text-xs text-ink-secondary">
        Loading media details…
      </div>
    );
  }

  if (!activeItem) {
    return (
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center space-y-4">
        <div className="text-sm text-danger">{error || 'Media item not found.'}</div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface text-xs text-ink cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {backLabel}
        </button>
      </div>
    );
  }

  const progress = detail?.progress;
  const isWatched = Boolean(progress?.completed);
  const hasResume = Boolean(
    progress && !progress.completed && progress.position_ms > 5_000 && activeItem.duration_ms > 0,
  );
  const remainingMS = hasResume && progress ? Math.max(0, activeItem.duration_ms - progress.position_ms) : activeItem.duration_ms;
  const progressPct =
    hasResume && progress && activeItem.duration_ms > 0
      ? Math.min(100, Math.round((progress.position_ms / activeItem.duration_ms) * 100))
      : 0;

  const endsAt =
    remainingMS > 0
      ? new Date(Date.now() + remainingMS).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

  const formattedRelease = formatReleaseDate(detail?.release_date);
  const directors = detail?.directors ?? [];
  const writers = detail?.writers ?? [];
  const studios = detail?.studios ?? [];
  const cast = detail?.cast ?? [];
  const audioTracks = detail?.audio_tracks ?? [];
  const subtitleTracks = detail?.subtitles ?? [];
  const tmdbURL = detail?.tmdb_id
    ? activeItem.kind === 'episode'
      ? `https://www.themoviedb.org/tv/${detail.tmdb_id}`
      : `https://www.themoviedb.org/movie/${detail.tmdb_id}`
    : '';
  const imdbURL = detail?.imdb_id ? `https://www.imdb.com/title/${detail.imdb_id}/` : '';

  const resLabel = formatResolution(activeItem.video_width, activeItem.video_height, true);

  const similarItems = similar?.items ?? [];
  const similarSeries = similar?.series ?? [];
  const hasSimilar = similarItems.length > 0 || similarSeries.length > 0;

  const bustSuffix = artBust ? `?v=${artBust}` : '';
  const posterSrc = activeItem.poster_url ? `${activeItem.poster_url}${bustSuffix}` : '';
  const backdropSrc = activeItem.backdrop_url ? `${activeItem.backdrop_url}${bustSuffix}` : '';

  return (
    <div className="relative">
      {/* Full-bleed Widescreen Backdrop Banner */}
      <div className="relative h-[34vh] min-h-[240px] sm:h-[46vh] sm:min-h-[360px] sm:max-h-[540px] w-full overflow-hidden">
        {backdropSrc ? (
          <img
            src={backdropSrc}
            alt=""
            className="w-full h-full object-cover object-[50%_20%] opacity-55"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-elevated/60 via-surface/40 to-canvas" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-canvas from-5% via-canvas/60 via-40% to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-canvas/45 via-transparent via-25% to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-canvas/75 via-transparent via-45% to-canvas/30" />

        <div className="absolute top-4 sm:top-6 inset-x-0 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-canvas/60 backdrop-blur-xl backdrop-saturate-150 border border-tone/12 text-xs font-medium text-ink hover:border-tone/30 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {backLabel}
          </button>

          {(prevEpisode || nextEpisode) && (
            <div className="flex items-center gap-1.5">
              {prevEpisode && (
                <button
                  type="button"
                  onClick={() => onSelectItem(prevEpisode)}
                  title={`Previous: ${prevEpisode.title}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-canvas/60 backdrop-blur-xl backdrop-saturate-150 border border-tone/12 text-xs font-medium text-ink-secondary hover:text-ink hover:border-tone/30 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Prev</span>
                </button>
              )}
              {nextEpisode && (
                <button
                  type="button"
                  onClick={() => onSelectItem(nextEpisode)}
                  title={`Next: ${nextEpisode.title}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-canvas/60 backdrop-blur-xl backdrop-saturate-150 border border-tone/12 text-xs font-medium text-ink-secondary hover:text-ink hover:border-tone/30 transition-colors cursor-pointer"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Overlapping Hero */}
      <div className="relative max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 -mt-28 sm:-mt-52 pb-16 space-y-8 sm:space-y-10">
        <div className="flex flex-col sm:flex-row gap-5 sm:gap-8 items-start">
          {/* Poster */}
          <div className="relative w-36 sm:w-52 lg:w-56 shrink-0 aspect-[2/3] rounded-2xl overflow-hidden bg-surface border border-tone/12 shadow-[0_20px_50px_rgba(0,0,0,0.35)] flex items-center justify-center">
            {posterSrc ? (
              <img src={posterSrc} alt={activeItem.title} className="w-full h-full object-cover" />
            ) : (
              <LuneMark alt="Lune" className="w-14 h-14 opacity-40" />
            )}
            {isWatched && (
              <div
                title="Watched"
                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-telemetry text-[#09090B] flex items-center justify-center shadow-md"
              >
                <Check className="w-4 h-4 stroke-[3]" />
              </div>
            )}
            {progressPct > 0 && (
              <div className="absolute bottom-0 inset-x-0 h-1.5 bg-black/65">
                <div className="h-full bg-white" style={{ width: `${progressPct}%` }} />
              </div>
            )}
          </div>

          {/* Primary Metadata & Actions */}
          <div className="flex-1 pt-2 sm:pt-12 space-y-5 min-w-0">
            <div>
              {activeItem.series_title && (
                <button
                  type="button"
                  onClick={() => onSelectSeries(activeItem.library_id, activeItem.series_title!)}
                  className="inline-flex items-center gap-1 text-xs tabular-nums font-medium uppercase tracking-[0.12em] text-telemetry hover:underline mb-1 cursor-pointer"
                >
                  <span>{activeItem.series_title}</span>
                  {activeItem.season_number != null && activeItem.episode_number != null && (
                    <span>
                      · S{String(activeItem.season_number).padStart(2, '0')}E
                      {String(activeItem.episode_number).padStart(2, '0')}
                    </span>
                  )}
                </button>
              )}
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-ink tracking-tight break-words">
                {activeItem.title}
              </h1>
              {activeItem.original_title && activeItem.original_title !== activeItem.title && (
                <div className="text-xs text-ink-secondary/80 mt-0.5">{activeItem.original_title}</div>
              )}
              {detail?.tagline && (
                <p className="text-sm italic text-ink-secondary mt-1.5">{detail.tagline}</p>
              )}

              {(() => {
                const metaParts: ReactNode[] = [];
                if (detail?.content_rating) {
                  metaParts.push(
                    <span
                      key="cert"
                      className="px-1.5 py-0.5 rounded bg-surface/90 border border-tone/18 text-[11px] font-semibold text-ink tracking-wide"
                    >
                      {detail.content_rating}
                    </span>,
                  );
                }
                if (activeItem.year) {
                  metaParts.push(<span key="year">{activeItem.year}</span>);
                }
                if (activeItem.rating) {
                  metaParts.push(
                    <span key="rating" className="text-warning font-medium">
                      ★ {activeItem.rating.toFixed(1)}
                    </span>,
                  );
                }
                if (activeItem.duration_ms > 0) {
                  metaParts.push(<span key="dur">{formatDuration(activeItem.duration_ms)}</span>);
                }
                if (endsAt) {
                  metaParts.push(<span key="ends">Ends at {endsAt}</span>);
                }
                if (resLabel) {
                  metaParts.push(
                    <span
                      key="res"
                      className="px-1.5 py-0.5 rounded bg-surface border border-tone/14 text-[10px] font-semibold text-ink"
                    >
                      {resLabel}
                    </span>,
                  );
                }
                if (activeItem.video_hdr && activeItem.video_hdr !== 'sdr') {
                  const hdrLabel =
                    activeItem.video_hdr.toLowerCase() === 'dovi_hdr10'
                      ? 'DV · HDR10'
                      : activeItem.video_hdr.toLowerCase() === 'dovi'
                        ? 'DV'
                        : activeItem.video_hdr.toLowerCase() === 'hdr10plus'
                          ? 'HDR10+'
                          : activeItem.video_hdr.toUpperCase();
                  metaParts.push(
                    <span
                      key="hdr"
                      className="px-1.5 py-0.5 rounded bg-surface border border-tone/18 text-[10px] font-semibold text-ink"
                    >
                      {hdrLabel}
                    </span>,
                  );
                }
                if (activeItem.dual_audio) {
                  metaParts.push(
                    <span
                      key="dual"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-telemetry/12 border border-telemetry/30 text-[10px] font-semibold text-telemetry"
                    >
                      <Languages className="w-3 h-3" />
                      DUAL
                    </span>,
                  );
                }
                if (metaParts.length === 0) return null;
                return (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 mt-3 text-xs tabular-nums text-ink-secondary">
                    {metaParts.map((part, i) => (
                      <span key={i} className="inline-flex items-center gap-2.5">
                        {part}
                        {i < metaParts.length - 1 && <span aria-hidden="true">·</span>}
                      </span>
                    ))}
                  </div>
                );
              })()}

              {detail?.genres && detail.genres.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3.5">
                  {detail.genres.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => onDiscover({ kind: 'genre', value: g })}
                      className="px-2.5 py-0.5 rounded-full bg-surface hover:bg-elevated border border-tone/10 hover:border-tone/25 text-xs text-ink-secondary hover:text-ink transition-colors cursor-pointer"
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Primary Action Row */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => launchPlayback()}
                className="inline-flex items-center gap-2 max-w-full rounded-xl bg-accent hover:bg-accent-hover text-on-accent font-semibold text-sm px-5 sm:px-6 py-3 shadow-md transition-colors cursor-pointer tabular-nums"
              >
                <Play className="w-4 h-4 fill-current shrink-0" />
                <span className="truncate">
                  {hasResume ? `Resume · ${formatTimeLeft(remainingMS)}` : 'Play'}
                </span>
              </button>

              {hasResume && (
                <button
                  type="button"
                  onClick={() => launchPlayback(0)}
                  title="Play from the beginning"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-surface hover:bg-elevated border border-hairline hover:border-tone/25 text-xs font-medium text-ink px-3.5 py-3 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Start Over</span>
                </button>
              )}

              {detail && (
                <>
                  <button
                    type="button"
                    disabled={togglingMark === 'watchlist'}
                    onClick={toggleWatchlist}
                    className={`inline-flex items-center gap-2 rounded-xl border text-xs font-medium px-3.5 py-3 transition-colors cursor-pointer ${
                      detail.in_watchlist
                        ? 'bg-tone/12 border-tone/35 text-ink'
                        : 'bg-surface border-hairline hover:border-tone/30 text-ink'
                    }`}
                  >
                    {detail.in_watchlist ? (
                      <BookmarkCheck className="w-4 h-4 text-ink" />
                    ) : (
                      <Bookmark className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">{detail.in_watchlist ? 'In Watchlist' : 'Watchlist'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={togglingMark === 'favorite'}
                    onClick={toggleFavorite}
                    title={detail.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                    className={`inline-flex items-center gap-2 rounded-xl border text-xs font-medium px-3.5 py-3 transition-colors cursor-pointer ${
                      detail.is_favorite
                        ? 'bg-danger/15 border-danger/50 text-danger'
                        : 'bg-surface border-hairline hover:border-danger/50 text-ink'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${detail.is_favorite ? 'fill-current' : ''}`} />
                    <span className="hidden md:inline">{detail.is_favorite ? 'Favorited' : 'Favorite'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={togglingMark === 'watched'}
                    onClick={toggleWatched}
                    title={isWatched ? 'Mark as unwatched' : 'Mark as watched'}
                    className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border transition-colors cursor-pointer ${
                      isWatched
                        ? 'bg-telemetry/15 border-telemetry/45 text-telemetry'
                        : 'bg-surface border-hairline hover:border-tone/30 text-ink-secondary hover:text-ink'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                  </button>

                  {/* User More Menu (Media Info, Download, Copy Stream URL) */}
                  <div ref={moreMenuRef} className="relative">
                    <button
                      type="button"
                      aria-label="More options"
                      aria-expanded={showMoreMenu}
                      title="More options"
                      onClick={() => {
                        setShowAdminMenu(false);
                        setShowMoreMenu((v) => !v);
                      }}
                      className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border transition-colors cursor-pointer ${
                        showMoreMenu
                          ? 'bg-tone/12 border-tone/30 text-ink'
                          : 'bg-surface border-hairline hover:border-tone/30 text-ink-secondary hover:text-ink'
                      }`}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {showMoreMenu && (
                      <div className="fixed inset-x-4 bottom-4 sm:inset-x-auto sm:bottom-auto sm:absolute sm:right-0 sm:top-12 z-50 sm:z-30 sm:w-56 rounded-xl bg-surface/95 backdrop-blur-xl backdrop-saturate-150 border border-tone/12 shadow-2xl p-1.5 space-y-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setShowMoreMenu(false);
                            setShowMediaInfo(true);
                          }}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-ink hover:bg-tone/10 transition-colors cursor-pointer"
                        >
                          <Info className="w-3.5 h-3.5 text-ink-secondary" />
                          Media Info
                        </button>
                        <button
                          type="button"
                          disabled={busyAction === 'download'}
                          onClick={handleDownloadOriginal}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-ink hover:bg-tone/10 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5 text-ink-secondary" />
                          Download Original
                        </button>
                        <button
                          type="button"
                          disabled={busyAction === 'copy'}
                          onClick={handleCopyStreamURL}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-ink hover:bg-tone/10 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {copiedStreamURL ? (
                            <Check className="w-3.5 h-3.5 text-healthy" />
                          ) : (
                            <Link2 className="w-3.5 h-3.5 text-ink-secondary" />
                          )}
                          {copiedStreamURL ? 'Stream URL Copied' : 'Copy Stream URL'}
                        </button>
                        {hasResume && (
                          <>
                            <div className="my-1 border-t border-tone/[0.08]" />
                            <button
                              type="button"
                              onClick={handleClearResume}
                              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-ink-secondary hover:text-ink hover:bg-tone/10 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Reset Watch Progress
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {isAdmin && (
                <div ref={adminMenuRef} className="relative">
                  <button
                    type="button"
                    aria-label="Admin options"
                    aria-expanded={showAdminMenu}
                    title="Admin options"
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowAdminMenu((v) => !v);
                    }}
                    className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border transition-colors cursor-pointer ${
                      showAdminMenu || showRematch
                        ? 'bg-tone/12 border-tone/30 text-ink'
                        : 'bg-surface border-hairline hover:border-tone/30 text-ink-secondary hover:text-ink'
                    }`}
                  >
                    <Settings className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  </button>

                  {showAdminMenu && (
                    <div className="fixed inset-x-4 bottom-4 sm:inset-x-auto sm:bottom-auto sm:absolute sm:right-0 sm:top-12 z-50 sm:z-30 sm:w-52 rounded-xl bg-surface/95 backdrop-blur-xl backdrop-saturate-150 border border-tone/12 shadow-2xl p-1.5 space-y-0.5">
                      <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                        Admin Options
                      </div>
                      <button
                        type="button"
                        disabled={refreshing}
                        onClick={handleQuickRefresh}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-ink hover:bg-tone/10 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-ink-secondary ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh Metadata
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAdminMenu(false);
                          setShowRematch((v) => !v);
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-ink hover:bg-tone/10 transition-colors cursor-pointer"
                      >
                        <Search className="w-3.5 h-3.5 text-ink-secondary" />
                        Re-Match Metadata
                      </button>
                    </div>
                  )}
                </div>
              )}

              {(imdbURL || tmdbURL) && (
                <div className="flex items-center gap-2 sm:ml-1">
                  {imdbURL && (
                    <a
                      href={imdbURL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-surface/70 border border-tone/10 hover:border-tone/30 px-2.5 py-1.5 text-[11px] tabular-nums text-ink-secondary hover:text-ink transition-colors"
                    >
                      IMDb
                      <ExternalLink className="w-3 h-3 opacity-70" />
                    </a>
                  )}
                  {tmdbURL && (
                    <a
                      href={tmdbURL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-surface/70 border border-tone/10 hover:border-tone/30 px-2.5 py-1.5 text-[11px] tabular-nums text-ink-secondary hover:text-ink transition-colors"
                    >
                      TMDB
                      <ExternalLink className="w-3 h-3 opacity-70" />
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Pre-Play Audio & Subtitle Track Selectors */}
            {detail && (audioTracks.length > 0 || subtitleTracks.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl pt-1">
                {audioTracks.length > 0 && (
                  <label className="flex flex-col gap-1">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                      <Volume2 className="w-3 h-3" />
                      Audio
                    </span>
                    {audioTracks.length === 1 ? (
                      <div className="h-9 flex items-center rounded-lg bg-surface/70 border border-tone/[0.08] px-3 text-xs text-ink-secondary tabular-nums">
                        <span className="truncate">{formatAudioTrackLabel(audioTracks[0])}</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <select
                          value={selectedAudioIdx ?? audioTracks[0].index}
                          onChange={(e) => setSelectedAudioIdx(Number(e.target.value))}
                          className="appearance-none w-full h-9 rounded-lg bg-surface/70 hover:bg-surface border border-tone/12 hover:border-tone/25 pl-3 pr-8 text-base sm:text-xs text-ink tabular-nums truncate focus:outline-none focus:border-tone/45 transition-colors cursor-pointer"
                        >
                          {audioTracks.map((tr) => (
                            <option key={tr.index} value={tr.index}>
                              {formatAudioTrackLabel(tr)}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-ink-muted pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                      </div>
                    )}
                  </label>
                )}

                {subtitleTracks.length > 0 && (
                  <label className="flex flex-col gap-1">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                      <Subtitles className="w-3 h-3" />
                      Subtitles
                    </span>
                    <div className="relative">
                      <select
                        value={selectedSubIdx === null ? '' : String(selectedSubIdx)}
                        onChange={(e) =>
                          setSelectedSubIdx(e.target.value === '' ? null : Number(e.target.value))
                        }
                        className="appearance-none w-full h-9 rounded-lg bg-surface/70 hover:bg-surface border border-tone/12 hover:border-tone/25 pl-3 pr-8 text-base sm:text-xs text-ink tabular-nums truncate focus:outline-none focus:border-tone/45 transition-colors cursor-pointer"
                      >
                        <option value="">Off</option>
                      {subtitleTracks.map((sub) => {
                        const fmt = sub.format
                          ? sub.format.toLowerCase() === 'subrip'
                            ? 'SRT'
                            : sub.format.toLowerCase() === 'hdmv_pgs_subtitle' || sub.format.toLowerCase() === 'pgssub'
                              ? 'PGS'
                              : sub.format.toLowerCase() === 'dvd_subtitle' || sub.format.toLowerCase() === 'vobsub'
                                ? 'VOBSUB'
                                : sub.format.toLowerCase() === 'dvb_subtitle' || sub.format.toLowerCase() === 'dvbsub'
                                  ? 'DVB'
                                  : sub.format.toUpperCase()
                          : '';
                        return (
                          <option key={sub.index} value={String(sub.index)}>
                            {sub.label}
                            {fmt ? ` · ${fmt}` : ''}
                            {sub.requires_burn_in ? ' (Burn-in)' : ''}
                          </option>
                        );
                      })}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-ink-muted pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </label>
                )}
              </div>
            )}

            {error && (
              <div className="max-w-xl rounded-lg bg-danger/10 border border-danger/30 px-3.5 py-2.5 text-xs text-danger">
                {error}
              </div>
            )}

            {activeItem.overview && (
              <p className="text-sm text-ink-secondary leading-relaxed max-w-3xl">{activeItem.overview}</p>
            )}

            {/* Key Credits Summary (Clickable Directors, Writers, Studios, Release Date) */}
            {(directors.length > 0 || writers.length > 0 || studios.length > 0 || formattedRelease) && (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5 max-w-3xl pt-1 text-xs">
                {directors.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      {directors.length === 1 ? 'Director' : 'Directors'}
                    </dt>
                    <dd className="text-ink/90 leading-snug flex flex-wrap gap-x-1.5 gap-y-0.5">
                      {directors.map((name, i) => (
                        <span key={name} className="inline-flex items-baseline">
                          <button
                            type="button"
                            onClick={() => onDiscover({ kind: 'person', value: name })}
                            className="hover:underline cursor-pointer"
                          >
                            {name}
                          </button>
                          {i < directors.length - 1 && (
                            <span className="text-ink-muted" aria-hidden="true">,</span>
                          )}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {writers.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      {writers.length === 1 ? 'Writer' : 'Writers'}
                    </dt>
                    <dd className="text-ink/90 leading-snug flex flex-wrap gap-x-1.5 gap-y-0.5">
                      {writers.map((name, i) => (
                        <span key={name} className="inline-flex items-baseline">
                          <button
                            type="button"
                            onClick={() => onDiscover({ kind: 'person', value: name })}
                            className="hover:underline cursor-pointer"
                          >
                            {name}
                          </button>
                          {i < writers.length - 1 && (
                            <span className="text-ink-muted" aria-hidden="true">,</span>
                          )}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {studios.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      {studios.length === 1 ? 'Studio' : 'Studios'}
                    </dt>
                    <dd className="text-ink/90 leading-snug flex flex-wrap gap-x-1.5 gap-y-0.5">
                      {studios.map((name, i) => (
                        <span key={name} className="inline-flex items-baseline">
                          <button
                            type="button"
                            onClick={() => onDiscover({ kind: 'studio', value: name })}
                            className="hover:underline cursor-pointer"
                          >
                            {name}
                          </button>
                          {i < studios.length - 1 && (
                            <span className="text-ink-muted" aria-hidden="true">,</span>
                          )}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {formattedRelease && (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      {activeItem.kind === 'episode' ? 'Aired' : 'Released'}
                    </dt>
                    <dd className="text-ink/90 leading-snug tabular-nums">{formattedRelease}</dd>
                  </div>
                )}
              </dl>
            )}

            {/* Media Info Modal Trigger */}
            {detail && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowMediaInfo(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface hover:bg-elevated border border-tone/[0.08] hover:border-tone/25 text-[11px] font-medium text-ink-secondary hover:text-ink transition-colors cursor-pointer"
                >
                  <Info className="w-3 h-3" />
                  Media Info
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Clickable MKV Chapters (Jump straight to timestamp) */}
        {detail?.chapters && detail.chapters.length > 0 && (
          detail.chapters.some((ch) => Boolean(ch.thumbnail_url)) ? (
            <MediaShelf
              itemCount={detail.chapters.length}
              header={
                <h2 className="text-base font-semibold tracking-[-0.02em] text-ink">
                  Chapters{' '}
                  <span className="text-xs font-normal text-ink-muted tabular-nums ml-1">
                    {detail.chapters.length}
                  </span>
                </h2>
              }
            >
              {detail.chapters.map((ch) => (
                <ChapterCard
                  key={ch.index}
                  chapter={ch}
                  bustSuffix={bustSuffix}
                  onSelect={() => launchPlayback(ch.start_ms)}
                />
              ))}
            </MediaShelf>
          ) : (
            <section className="space-y-3">
              <h2 className="text-base font-semibold tracking-[-0.02em] text-ink">
                Chapters{' '}
                <span className="text-xs font-normal text-ink-muted tabular-nums ml-1">
                  {detail.chapters.length}
                </span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {detail.chapters.map((ch) => (
                  <button
                    key={ch.index}
                    type="button"
                    onClick={() => launchPlayback(ch.start_ms)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface hover:bg-elevated border border-tone/[0.08] hover:border-tone/25 text-xs tabular-nums transition-colors cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current text-ink-secondary" />
                    <span className="font-medium text-ink">{ch.title || `Chapter ${ch.index + 1}`}</span>
                    <span className="text-ink-muted">{formatDuration(ch.start_ms)}</span>
                  </button>
                ))}
              </div>
            </section>
          )
        )}

        {/* More from This Season Shelf (Episodes Only) */}
        {currentSeason && currentSeason.episodes.length > 1 && seriesDetail && (
          <MediaShelf
            itemCount={currentSeason.episodes.length}
            header={
              <button
                type="button"
                onClick={() => onSelectSeries(seriesDetail.library_id, seriesDetail.title)}
                className="group inline-flex items-center gap-1 text-base font-semibold tracking-[-0.02em] text-ink hover:text-ink transition-colors cursor-pointer"
              >
                <span>
                  More from {seriesDetail.title}{' '}
                  {currentSeason.season_number === 0 ? 'Specials' : `Season ${currentSeason.season_number}`}
                </span>
                <ChevronRight className="w-4 h-4 text-ink-secondary group-hover:translate-x-0.5 transition-transform" />
              </button>
            }
          >
            {currentSeason.episodes.map(({ item: ep, progress: epProg }) => {
              const isCurrent = ep.id === itemId;
              const epWatched = Boolean(epProg?.completed);
              const epPct =
                epProg && epProg.duration_ms > 0
                  ? Math.min(100, Math.round((epProg.position_ms / epProg.duration_ms) * 100))
                  : 0;
              return (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => (isCurrent ? launchPlayback() : onSelectItem(ep))}
                  className={`group w-[228px] sm:w-[252px] shrink-0 snap-start text-left flex flex-col rounded-xl bg-surface border overflow-hidden transition-all duration-200 cursor-pointer ${
                    isCurrent
                      ? 'border-tone/40 ring-1 ring-tone/20'
                      : 'border-tone/[0.08] hover:border-tone/25 hover:-translate-y-0.5'
                  }`}
                >
                  <div className="relative aspect-video w-full bg-gradient-to-br from-elevated via-surface to-canvas overflow-hidden">
                    {ep.backdrop_url ? (
                      <img
                        src={ep.backdrop_url}
                        alt={ep.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <LuneMark alt="" className="w-8 h-8 opacity-30" />
                      </div>
                    )}
                    {isCurrent && (
                      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-white text-[#09090B] text-[10px] font-semibold">
                        Viewing
                      </span>
                    )}
                    {epWatched && (
                      <div
                        title="Watched"
                        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-telemetry text-[#09090B] flex items-center justify-center shadow"
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                    {epPct > 0 && !epWatched && (
                      <div className="absolute bottom-0 inset-x-0 h-1 bg-black/65">
                        <div className="h-full bg-white" style={{ width: `${epPct}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5 space-y-0.5">
                    <div className="text-xs font-medium text-ink truncate">
                      {ep.episode_number != null ? `${ep.episode_number}. ${ep.title}` : ep.title}
                    </div>
                    <div className="text-[11px] text-ink-muted tabular-nums">
                      {ep.duration_ms > 0 ? formatDuration(ep.duration_ms) : ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </MediaShelf>
        )}

        {/* Cast & Crew Horizontal Shelf */}
        {cast.length > 0 && (
          <CastShelf
            title="Cast"
            people={cast}
            onSelectPerson={(name) => onDiscover({ kind: 'person', value: name })}
          />
        )}

        {/* Local "More Like This" Shelf */}
        {hasSimilar && (
          <MediaShelf
            itemCount={similarSeries.length + similarItems.length}
            header={
              <h2 className="text-base font-semibold tracking-[-0.02em] text-ink">More Like This</h2>
            }
          >
            {similarSeries.map((s) => (
              <div key={`${s.library_id}:${s.title}`} className={SHELF_CARD_CLASS}>
                <SeriesCard
                  series={s}
                  onSelect={(ser) => onSelectSeries(ser.library_id, ser.title, ser)}
                />
              </div>
            ))}
            {similarItems.map((it) => (
              <div key={it.id} className={SHELF_CARD_CLASS}>
                <MediaCard item={it} onSelect={onSelectItem} />
              </div>
            ))}
          </MediaShelf>
        )}
      </div>

      {showMediaInfo && detail && (
        <MediaInfoModal detail={detail} onClose={() => setShowMediaInfo(false)} />
      )}

      {showRematch && isAdmin && (
        <IdentifyModal
          kind={activeItem.kind === 'episode' ? 'tv' : 'movie'}
          heading={activeItem.series_title || activeItem.title}
          subtitle={
            activeItem.kind === 'episode'
              ? 'Choose the exact TV or Anime series from TMDB to re-match this episode.'
              : 'Choose the exact movie from TMDB to update metadata and artwork.'
          }
          initialQuery={activeItem.series_title || activeItem.title}
          initialYear={activeItem.year}
          currentTMDBID={detail?.tmdb_id}
          onSelectCandidate={handleSelectIdentifyCandidate}
          onClose={() => setShowRematch(false)}
        />
      )}
    </div>
  );
}
