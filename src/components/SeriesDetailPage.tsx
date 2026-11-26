import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Play,
  Check,
  CheckCheck,
  Info,
  Star,
  Sparkles,
  Languages,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Heart,
  Settings,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  api,
  type DiscoverFilter,
  type MediaItemSummary,
  type MetadataSearchResult,
  type PlaybackProgress,
  type SeriesDetail,
  type SeriesSummary,
  type SimilarMediaResponse,
} from '../lib/api';
import { viewCache } from '../lib/cache';
import { CastShelf } from './CastShelf';
import { IdentifyModal } from './IdentifyModal';
import { LuneMark } from './LuneMark';
import { MediaCard } from './MediaCard';
import { MediaShelf, SHELF_CARD_CLASS } from './MediaShelf';
import { SeriesCard } from './SeriesCard';

interface Props {
  libraryId: string;
  title: string;
  initialSeries?: SeriesSummary;
  isAdmin?: boolean;
  backLabel: string;
  onBack: () => void;
  onSelectEpisode: (ep: MediaItemSummary) => void;
  onPlayEpisode: (ep: MediaItemSummary) => void;
  onSelectSeries: (libraryId: string, title: string, initialSeries?: SeriesSummary) => void;
  onDiscover: (filter: DiscoverFilter) => void;
  onMetadataUpdated: () => void;
}

export function SeriesDetailPage({
  libraryId,
  title,
  initialSeries,
  isAdmin = false,
  backLabel,
  onBack,
  onSelectEpisode,
  onPlayEpisode,
  onSelectSeries,
  onDiscover,
  onMetadataUpdated,
}: Props) {
  const cachedSeries = viewCache.getSeriesDetail(libraryId, title) ?? null;
  const [detail, setDetail] = useState<SeriesDetail | null>(cachedSeries);
  const [similar, setSimilar] = useState<SimilarMediaResponse | null>(() =>
    cachedSeries?.representative_item_id
      ? viewCache.getItemSimilar(cachedSeries.representative_item_id) ?? null
      : null,
  );
  const [selectedSeason, setSelectedSeason] = useState<number | null>(() => {
    if (!cachedSeries) return null;
    if (cachedSeries.next_up?.season_number != null) return cachedSeries.next_up.season_number;
    return cachedSeries.seasons.length > 0 ? cachedSeries.seasons[0].season_number : null;
  });
  const [loading, setLoading] = useState(!cachedSeries);
  const [togglingId, setTogglingId] = useState('');
  const [togglingMark, setTogglingMark] = useState<'watchlist' | 'favorite' | 'series-watched' | 'season-watched' | null>(null);
  const [error, setError] = useState('');

  // Admin menu & re-match
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showRematch, setShowRematch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [artBust, setArtBust] = useState(0);
  const adminMenuRef = useRef<HTMLDivElement>(null);

  const loadSeries = useCallback(
    async (signal?: AbortSignal) => {
      const d = await api.getSeriesDetail(libraryId, title, signal);
      viewCache.setSeriesDetail(libraryId, title, d);
      setDetail(d);
      setSelectedSeason((cur) => {
        if (cur !== null && d.seasons.some((s) => s.season_number === cur)) return cur;
        if (d.next_up?.season_number != null) return d.next_up.season_number;
        return d.seasons.length > 0 ? d.seasons[0].season_number : null;
      });
      return d;
    },
    [libraryId, title],
  );

  useEffect(() => {
    const cached = viewCache.getSeriesDetail(libraryId, title) ?? null;
    setDetail(cached);
    setSimilar(
      cached?.representative_item_id
        ? viewCache.getItemSimilar(cached.representative_item_id) ?? null
        : null,
    );
    if (cached) {
      setSelectedSeason((cur) => {
        if (cur !== null && cached.seasons.some((s) => s.season_number === cur)) return cur;
        if (cached.next_up?.season_number != null) return cached.next_up.season_number;
        return cached.seasons.length > 0 ? cached.seasons[0].season_number : null;
      });
    }
    setLoading(!cached);
    setError('');
    setShowAdminMenu(false);
    setShowRematch(false);

    const controller = new AbortController();
    let active = true;

    const loadSimilar = (repId: string) => {
      if (viewCache.isItemSimilarFresh(repId)) return;
      api
        .getSimilarItems(repId, 12, controller.signal)
        .then((res) => {
          if (!active) return;
          viewCache.setItemSimilar(repId, res);
          setSimilar(res);
        })
        .catch(() => {});
    };

    if (cached && viewCache.isSeriesDetailFresh(libraryId, title)) {
      if (cached.representative_item_id) {
        loadSimilar(cached.representative_item_id);
      }
      return () => {
        active = false;
        controller.abort();
      };
    }

    loadSeries(controller.signal)
      .then((d) => {
        if (!active || !d?.representative_item_id) return;
        loadSimilar(d.representative_item_id);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [libraryId, title, loadSeries]);

  useEffect(() => {
    if (!showAdminMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) {
        setShowAdminMenu(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAdminMenu(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showAdminMenu]);

  async function handleToggleWatched(ep: MediaItemSummary, progress?: PlaybackProgress) {
    setTogglingId(ep.id);
    try {
      const nextCompleted = !progress?.completed;
      await api.updateProgress(ep.id, nextCompleted ? ep.duration_ms || 1 : 0, nextCompleted);
      await loadSeries();
      onMetadataUpdated();
    } finally {
      setTogglingId('');
    }
  }

  async function handleToggleSeriesMark(kind: 'watchlist' | 'favorite') {
    if (!detail?.representative_item_id || togglingMark) return;
    setTogglingMark(kind);
    try {
      const id = detail.representative_item_id;
      let next: SeriesDetail;
      if (kind === 'watchlist') {
        if (detail.in_watchlist) {
          await api.removeFromWatchlist(id);
          next = { ...detail, in_watchlist: false };
        } else {
          await api.addToWatchlist(id);
          next = { ...detail, in_watchlist: true };
        }
      } else {
        if (detail.is_favorite) {
          await api.removeFromFavorites(id);
          next = { ...detail, is_favorite: false };
        } else {
          await api.addToFavorites(id);
          next = { ...detail, is_favorite: true };
        }
      }
      viewCache.setSeriesDetail(detail.library_id, detail.title, next);
      setDetail(next);
      onMetadataUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update list');
    } finally {
      setTogglingMark(null);
    }
  }

  async function handleBulkWatched(completed: boolean, seasonNumber?: number) {
    if (!detail || togglingMark) return;
    setTogglingMark(seasonNumber === undefined ? 'series-watched' : 'season-watched');
    setError('');
    try {
      await api.setSeriesWatched({
        library_id: detail.library_id,
        title: detail.title,
        ...(seasonNumber !== undefined ? { season_number: seasonNumber } : {}),
        completed,
      });
      await loadSeries();
      onMetadataUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update watched state');
    } finally {
      setTogglingMark(null);
    }
  }

  async function handleRefreshSeries(overrideTitle?: string, overrideYear?: number, tmdbID?: string) {
    if (!detail) return;
    setShowAdminMenu(false);
    setRefreshing(true);
    setError('');
    try {
      const res = await api.refreshSeries({
        library_id: detail.library_id,
        title: detail.title,
        ...(overrideTitle ? { override_title: overrideTitle } : {}),
        ...(overrideYear ? { override_year: overrideYear } : {}),
        ...(tmdbID ? { tmdb_id: tmdbID } : {}),
      });
      setArtBust(Date.now());
      onMetadataUpdated();
      const nextTitle = res.title || overrideTitle;
      if (nextTitle && nextTitle.toLowerCase() !== detail.title.toLowerCase()) {
        onSelectSeries(detail.library_id, nextTitle);
      } else {
        await loadSeries();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh series metadata');
      throw err;
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSelectIdentifyCandidate(candidate: MetadataSearchResult) {
    await handleRefreshSeries(candidate.title, candidate.year, candidate.tmdb_id);
  }

  const activeSeason =
    detail?.seasons.find((s) => s.season_number === selectedSeason) ?? detail?.seasons[0];

  const nextUpLabel = detail?.next_up
    ? `S${String(detail.next_up.season_number ?? 0).padStart(2, '0')}E${String(detail.next_up.episode_number ?? 0).padStart(2, '0')} · ${detail.next_up.title}`
    : '';

  const bustSuffix = artBust ? `?v=${artBust}` : '';
  const backdropURL = (detail?.backdrop_url || initialSeries?.backdrop_url)
    ? `${detail?.backdrop_url || initialSeries?.backdrop_url}${bustSuffix}`
    : '';
  const posterURL = (detail?.poster_url || initialSeries?.poster_url)
    ? `${detail?.poster_url || initialSeries?.poster_url}${bustSuffix}`
    : '';
  const displayTitle = detail?.title || initialSeries?.title || title;
  const originalTitle = detail?.original_title || initialSeries?.original_title;
  const displayYear = detail?.year ?? initialSeries?.year;
  const seasonCount = detail?.season_count ?? initialSeries?.season_count ?? 0;
  const episodeCount = detail?.episode_count ?? initialSeries?.episode_count ?? 0;
  const watchedCount = detail?.watched_count ?? 0;
  const allWatched = episodeCount > 0 && watchedCount >= episodeCount;
  const activeSeasonAllWatched = Boolean(
    activeSeason &&
      activeSeason.episodes.length > 0 &&
      activeSeason.episodes.every((e) => Boolean(e.progress?.completed)),
  );
  const isAnime = (detail?.library_kind || initialSeries?.library_kind) === 'anime';
  const isDualAudio = Boolean(detail?.dual_audio ?? initialSeries?.dual_audio);

  const similarSeries = similar?.series ?? [];
  const similarItems = similar?.items ?? [];
  const hasSimilar = similarSeries.length > 0 || similarItems.length > 0;

  return (
    <div className="relative">
      {/* Full-bleed Atmospheric Series Backdrop */}
      <div className="relative h-[38vh] min-h-[280px] sm:h-[48vh] sm:min-h-[380px] sm:max-h-[540px] w-full overflow-hidden">
        {backdropURL ? (
          <img
            src={backdropURL}
            alt=""
            className="w-full h-full object-cover object-[50%_20%] opacity-55"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-elevated/60 via-surface/40 to-canvas" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-canvas from-5% via-canvas/60 via-40% to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-canvas/45 via-transparent via-25% to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-canvas/75 via-transparent via-45% to-canvas/30" />

        <div className="absolute top-6 inset-x-0 max-w-7xl mx-auto px-4 sm:px-6">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-canvas/60 backdrop-blur-xl backdrop-saturate-150 border border-tone/12 text-xs font-medium text-ink hover:border-tone/30 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {backLabel}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 -mt-36 sm:-mt-56 pb-16 space-y-10">
        <div className="flex flex-col sm:flex-row gap-8 items-start">
          <div className="w-40 sm:w-52 shrink-0 aspect-[2/3] rounded-2xl overflow-hidden bg-surface border border-tone/12 shadow-[0_20px_50px_rgba(0,0,0,0.35)] flex items-center justify-center">
            {posterURL ? (
              <img src={posterURL} alt={displayTitle} className="w-full h-full object-cover" />
            ) : (
              <LuneMark alt="Lune" className="w-12 h-12 opacity-40" />
            )}
          </div>

          <div className="flex-1 pt-2 sm:pt-12 space-y-4 min-w-0">
            <div>
              <div
                className={`inline-flex items-center gap-1.5 text-xs tabular-nums font-medium uppercase tracking-[0.12em] mb-1 ${
                  isAnime ? 'text-ink-secondary' : 'text-telemetry'
                }`}
              >
                {isAnime && <Sparkles className="w-3.5 h-3.5" />}
                {isAnime ? 'Anime Series' : 'Series'}
              </div>
              <h1 className="text-3xl sm:text-4xl font-semibold text-ink tracking-tight">
                {displayTitle}
              </h1>
              {originalTitle && originalTitle !== displayTitle && (
                <div className="text-sm text-ink-secondary mt-1">{originalTitle}</div>
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
                if (displayYear) metaParts.push(<span key="year">{displayYear}</span>);
                if (seasonCount > 0) {
                  metaParts.push(
                    <span key="seasons">
                      {seasonCount} {seasonCount === 1 ? 'Season' : 'Seasons'}
                    </span>,
                  );
                }
                if (episodeCount > 0) {
                  metaParts.push(
                    <span key="episodes">
                      {episodeCount} {episodeCount === 1 ? 'Episode' : 'Episodes'}
                    </span>,
                  );
                }
                if (watchedCount > 0 && episodeCount > 0) {
                  metaParts.push(
                    <span key="watched" className="text-telemetry">
                      {watchedCount}/{episodeCount} Watched
                    </span>,
                  );
                }
                if (detail?.studios && detail.studios.length > 0) {
                  const shownStudios = detail.studios.slice(0, 2);
                  metaParts.push(
                    <span key="studios" className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                      {shownStudios.map((st, idx) => (
                        <span key={st} className="inline-flex items-baseline">
                          <button
                            type="button"
                            onClick={() => onDiscover({ kind: 'studio', value: st })}
                            className="hover:text-ink hover:underline cursor-pointer"
                          >
                            {st}
                          </button>
                          {idx < shownStudios.length - 1 && (
                            <span className="text-ink-muted" aria-hidden="true">,</span>
                          )}
                        </span>
                      ))}
                    </span>,
                  );
                }
                if (metaParts.length === 0 && !isDualAudio) return null;
                return (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 mt-2.5 text-xs tabular-nums text-ink-secondary">
                    {metaParts.map((part, i) => (
                      <span key={i} className="inline-flex items-center gap-2.5">
                        {part}
                        {i < metaParts.length - 1 && <span aria-hidden="true">·</span>}
                      </span>
                    ))}
                    {isDualAudio && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-telemetry/12 border border-telemetry/30 text-[11px] font-medium text-telemetry">
                        <Languages className="w-3 h-3" />
                        Dual Audio
                      </span>
                    )}
                  </div>
                );
              })()}

              {detail?.genres && detail.genres.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
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

            {detail?.overview && (
              <p className="text-sm text-ink-secondary leading-relaxed max-w-3xl">
                {detail.overview}
              </p>
            )}

            {/* Action Row */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {detail?.next_up && (
                <button
                  type="button"
                  onClick={() => onPlayEpisode(detail.next_up!)}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent hover:bg-accent-hover text-on-accent font-semibold text-sm px-6 py-3 shadow-md transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Play Next Up · {nextUpLabel}
                </button>
              )}

              {detail?.representative_item_id && (
                <>
                  <button
                    type="button"
                    disabled={togglingMark === 'watchlist'}
                    onClick={() => handleToggleSeriesMark('watchlist')}
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
                    onClick={() => handleToggleSeriesMark('favorite')}
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
                    disabled={togglingMark === 'series-watched'}
                    onClick={() => handleBulkWatched(!allWatched)}
                    title={allWatched ? 'Mark entire series unwatched' : 'Mark entire series watched'}
                    className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border transition-colors cursor-pointer ${
                      allWatched
                        ? 'bg-telemetry/15 border-telemetry/45 text-telemetry'
                        : 'bg-surface border-hairline hover:border-tone/30 text-ink-secondary hover:text-ink'
                    }`}
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                </>
              )}

              {isAdmin && detail && (
                <div ref={adminMenuRef} className="relative">
                  <button
                    type="button"
                    aria-label="Admin options"
                    aria-expanded={showAdminMenu}
                    title="Admin options"
                    onClick={() => setShowAdminMenu((v) => !v)}
                    className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border transition-colors cursor-pointer ${
                      showAdminMenu || showRematch
                        ? 'bg-tone/12 border-tone/30 text-ink'
                        : 'bg-surface border-hairline hover:border-tone/30 text-ink-secondary hover:text-ink'
                    }`}
                  >
                    <Settings className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  </button>

                  {showAdminMenu && (
                    <div className="absolute left-0 sm:right-0 sm:left-auto top-12 z-30 w-56 rounded-xl bg-surface/92 backdrop-blur-xl backdrop-saturate-150 border border-tone/12 shadow-2xl p-1.5 space-y-0.5">
                      <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                        Admin Options
                      </div>
                      <button
                        type="button"
                        disabled={refreshing}
                        onClick={() => {
                          handleRefreshSeries().catch(() => {});
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-ink hover:bg-tone/10 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-ink-secondary ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh Series Metadata
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
                        Re-Match Series
                      </button>
                    </div>
                  )}
                </div>
              )}

              {detail?.imdb_id && (
                <a
                  href={`https://www.imdb.com/title/${detail.imdb_id}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-surface/70 border border-tone/10 hover:border-tone/30 px-2.5 py-1.5 text-[11px] tabular-nums text-ink-secondary hover:text-ink transition-colors"
                >
                  IMDb
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </a>
              )}
              {detail?.tmdb_id && (
                <a
                  href={`https://www.themoviedb.org/tv/${detail.tmdb_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-surface/70 border border-tone/10 hover:border-tone/30 px-2.5 py-1.5 text-[11px] tabular-nums text-ink-secondary hover:text-ink transition-colors"
                >
                  TMDB
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </a>
              )}
            </div>

            {error && (
              <div className="max-w-xl rounded-lg bg-danger/10 border border-danger/30 px-3.5 py-2.5 text-xs text-danger">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Seasons & Rich Episode Cards */}
        <section className="space-y-5">
          {loading || !detail ? (
            <div className="text-xs text-ink-secondary py-10 text-center">Loading episodes…</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {detail.seasons.map((s) => (
                    <button
                      key={s.season_number}
                      type="button"
                      onClick={() => setSelectedSeason(s.season_number)}
                      className={`px-4 py-2 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                        activeSeason?.season_number === s.season_number
                          ? 'bg-tone/12 border-tone/35 text-ink'
                          : 'bg-surface border-tone/[0.08] text-ink-secondary hover:text-ink'
                      }`}
                    >
                      {s.season_number === 0
                        ? isAnime
                          ? 'Specials & OVAs'
                          : 'Specials'
                        : `Season ${s.season_number}`}
                      <span className="tabular-nums text-[10px] opacity-60 ml-1.5">{s.episodes.length}</span>
                    </button>
                  ))}
                </div>

                {activeSeason && (
                  <button
                    type="button"
                    disabled={togglingMark === 'season-watched'}
                    onClick={() => handleBulkWatched(!activeSeasonAllWatched, activeSeason.season_number)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface hover:bg-elevated border border-tone/10 text-xs font-medium text-ink-secondary hover:text-ink transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {activeSeasonAllWatched ? 'Mark Season Unwatched' : 'Mark Season Watched'}
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {activeSeason?.episodes.map(({ item: ep, progress }) => {
                  const watched = Boolean(progress?.completed);
                  const pct =
                    progress && progress.duration_ms > 0
                      ? Math.min(100, Math.round((progress.position_ms / progress.duration_ms) * 100))
                      : 0;
                  const runtimeMin = ep.duration_ms > 0 ? Math.round(ep.duration_ms / 60_000) : 0;
                  const endsAt =
                    ep.duration_ms > 0
                      ? new Date(
                          Date.now() +
                            Math.max(0, ep.duration_ms - (watched ? 0 : progress?.position_ms ?? 0)),
                        ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '';
                  const epTitle =
                    ep.episode_number != null ? `${ep.episode_number}. ${ep.title}` : ep.title;

                  return (
                    <div
                      key={ep.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectEpisode(ep)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectEpisode(ep);
                        }
                      }}
                      className="group rounded-2xl bg-surface/75 hover:bg-elevated border border-tone/[0.08] hover:border-tone/25 transition-all overflow-hidden flex flex-col sm:flex-row items-stretch cursor-pointer"
                    >
                      {/* 16:9 Episode Still Thumbnail */}
                      <div className="relative sm:w-64 md:w-72 shrink-0 aspect-video bg-gradient-to-br from-elevated via-surface to-canvas overflow-hidden">
                        {ep.backdrop_url ? (
                          <img
                            src={ep.backdrop_url}
                            alt={ep.title}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <LuneMark alt="" className="w-9 h-9 opacity-30" />
                          </div>
                        )}

                        {/* Centered Play trigger on thumbnail */}
                        <button
                          type="button"
                          title={`Play ${ep.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlayEpisode(ep);
                          }}
                          className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/35 transition-colors cursor-pointer"
                        >
                          <div className="w-12 h-12 rounded-full bg-black/55 group-hover:bg-white text-white group-hover:text-[#09090B] border border-white/25 group-hover:border-white flex items-center justify-center backdrop-blur-md transition-all shadow-lg">
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                          </div>
                        </button>

                        {/* Top-right Watched checkmark badge */}
                        {watched && (
                          <div
                            title="Watched"
                            className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-telemetry text-[#09090B] flex items-center justify-center shadow-md"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}

                        {/* Bottom resume progress bar */}
                        {pct > 0 && !watched && (
                          <div className="absolute bottom-0 inset-x-0 h-1 bg-black/65">
                            <div className="h-full bg-white" style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>

                      {/* Middle Episode Metadata & Synopsis */}
                      <div className="flex-1 p-4 sm:p-5 flex flex-col justify-center gap-2 min-w-0">
                        <div className="text-base font-semibold text-ink truncate">
                          {epTitle}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-ink-secondary">
                          {runtimeMin > 0 && <span>{runtimeMin}m</span>}
                          {ep.absolute_episode_number != null &&
                            ep.absolute_episode_number !== ep.episode_number && (
                              <span className="text-ink">#{ep.absolute_episode_number}</span>
                            )}
                          {ep.rating && ep.rating > 0 ? (
                            <span className="inline-flex items-center gap-1 text-warning">
                              <Star className="w-3 h-3 fill-current" />
                              {ep.rating.toFixed(1)}
                            </span>
                          ) : null}
                          {endsAt && <span>Ends at {endsAt}</span>}
                          {ep.release_group && (
                            <span className="px-1.5 py-0.2 rounded bg-canvas/70 border border-tone/10 text-[10px] text-ink">
                              {ep.release_group}
                            </span>
                          )}
                          {ep.dual_audio && (
                            <span className="text-[10px] font-medium text-telemetry">DUAL AUDIO</span>
                          )}
                          {ep.container && (
                            <span className="text-ink-muted">
                              {ep.container.toUpperCase()}
                              {ep.video_codec ? ` · ${ep.video_codec.toUpperCase()}` : ''}
                            </span>
                          )}
                        </div>

                        {ep.overview ? (
                          <p className="text-xs sm:text-[13px] text-ink-secondary leading-relaxed line-clamp-3">
                            {ep.overview}
                          </p>
                        ) : (
                          <p className="text-xs text-ink-muted italic">
                            No episode synopsis indexed yet.
                          </p>
                        )}
                      </div>

                      {/* Right Quick Actions */}
                      <div className="px-4 pb-4 sm:py-4 sm:pr-5 flex sm:flex-row items-center justify-end gap-1.5 shrink-0">
                        <button
                          type="button"
                          title="Episode Details"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectEpisode(ep);
                          }}
                          className="p-2 rounded-lg text-ink-secondary hover:text-ink hover:bg-elevated transition-colors cursor-pointer"
                        >
                          <Info className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={togglingId === ep.id}
                          title={watched ? 'Mark as unwatched' : 'Mark as watched'}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleWatched(ep, progress);
                          }}
                          className={`p-2 rounded-lg transition-colors cursor-pointer ${
                            watched
                              ? 'text-telemetry hover:bg-telemetry/15'
                              : 'text-ink-secondary hover:text-ink hover:bg-elevated'
                          }`}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {detail?.cast && detail.cast.length > 0 && (
          <CastShelf
            title="Series Cast"
            people={detail.cast}
            onSelectPerson={(name) => onDiscover({ kind: 'person', value: name })}
          />
        )}

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
                <MediaCard item={it} onSelect={onSelectEpisode} />
              </div>
            ))}
          </MediaShelf>
        )}
      </div>

      {showRematch && isAdmin && (
        <IdentifyModal
          kind="tv"
          heading={displayTitle}
          subtitle={`Choose the exact TV or Anime series from TMDB to apply across all ${episodeCount} episodes.`}
          initialQuery={displayTitle}
          initialYear={displayYear}
          currentTMDBID={detail?.tmdb_id}
          onSelectCandidate={handleSelectIdentifyCandidate}
          onClose={() => setShowRematch(false)}
        />
      )}
    </div>
  );
}
