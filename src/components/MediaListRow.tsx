import { Layers, Sparkles, Star, X } from 'lucide-react';
import {
  formatDuration,
  type MediaItemSummary,
  type PlaybackProgress,
  type SeriesSummary,
} from '../lib/api';
import { AppLink, itemPath, seriesPath } from './AppLink';
import { LuneMark } from './LuneMark';

function resolutionLabel(height?: number): string {
  if (!height) return '';
  if (height >= 2000) return '4K';
  if (height >= 1000) return '1080p';
  if (height >= 700) return '720p';
  return '';
}

function hdrLabel(hdr?: string): string {
  return hdr && hdr !== 'sdr' ? hdr.toUpperCase() : '';
}

interface MediaListRowProps {
  item: MediaItemSummary;
  progress?: PlaybackProgress;
  progressPct?: number;
  onSelect: (item: MediaItemSummary) => void;
  onRemove?: (item: MediaItemSummary) => void;
  removeLabel?: string;
}

export function MediaListRow({
  item,
  progress,
  progressPct,
  onSelect,
  onRemove,
  removeLabel = 'Remove',
}: MediaListRowProps) {
  const resBadge = resolutionLabel(item.video_height);
  const hdrBadge = hdrLabel(item.video_hdr);
  const pct =
    progressPct !== undefined
      ? Math.min(100, Math.max(0, Math.round(progressPct)))
      : progress && progress.duration_ms > 0
        ? Math.min(100, Math.round((progress.position_ms / progress.duration_ms) * 100))
        : 0;

  const primaryTitle = item.series_title ? item.series_title : item.title;
  const episodeTag =
    item.series_title && item.season_number != null && item.episode_number != null
      ? `S${String(item.season_number).padStart(2, '0')}E${String(item.episode_number).padStart(2, '0')} · ${item.title}`
      : '';
  const summaryLine =
    episodeTag ||
    item.overview ||
    (item.genres && item.genres.length > 0 ? item.genres.slice(0, 3).join(' · ') : '');

  return (
    <div className="group/row relative flex items-center gap-3 rounded-xl bg-surface/40 hover:bg-elevated/70 border border-tone/[0.07] hover:border-tone/20 p-2.5 transition-colors">
      <AppLink
        href={itemPath(item.id)}
        onNavigate={() => onSelect(item)}
        className="flex flex-1 items-center gap-3.5 min-w-0 text-left cursor-pointer"
      >
        <div className="relative w-12 h-[72px] shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-elevated via-surface to-canvas border border-tone/[0.06]">
          {item.poster_url ? (
            <img
              src={item.poster_url}
              alt={primaryTitle}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover group-hover/row:scale-[1.03] transition-transform duration-200"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <LuneMark alt="" className="w-5 h-5 opacity-30" />
            </div>
          )}
          {pct > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-1 bg-black/65">
              <div className="h-full bg-white" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium tracking-[-0.01em] text-ink truncate">
              {primaryTitle}
            </span>
            {item.year && (
              <span className="text-xs tabular-nums text-ink-secondary shrink-0">
                {item.year}
              </span>
            )}
            {item.content_rating && (
              <span className="px-1.5 py-0.5 rounded bg-tone/[0.06] border border-tone/12 text-[10px] font-medium tabular-nums text-ink-secondary shrink-0">
                {item.content_rating}
              </span>
            )}
          </div>
          {summaryLine && (
            <p className="text-xs text-ink-muted truncate">{summaryLine}</p>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-2.5 shrink-0 tabular-nums">
          {item.rating !== undefined && item.rating > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary">
              <Star className="w-3 h-3 fill-current text-ink-secondary" />
              {item.rating.toFixed(1)}
            </span>
          )}
          {item.duration_ms > 0 && (
            <span className="text-xs text-ink-muted min-w-[52px] text-right">
              {formatDuration(item.duration_ms)}
            </span>
          )}
          <div className="flex items-center gap-1">
            {resBadge && (
              <span className="px-1.5 py-0.5 rounded bg-tone/[0.06] border border-tone/12 text-[10px] font-semibold tracking-wide text-ink-secondary">
                {resBadge}
              </span>
            )}
            {hdrBadge && (
              <span className="px-1.5 py-0.5 rounded bg-tone/[0.06] border border-tone/20 text-[10px] font-semibold tracking-wide text-ink">
                {hdrBadge}
              </span>
            )}
            {item.dual_audio && (
              <span className="px-1.5 py-0.5 rounded bg-[#64D2FF]/10 border border-[#64D2FF]/35 text-[10px] font-semibold tracking-wide text-telemetry">
                DUAL
              </span>
            )}
          </div>
        </div>
      </AppLink>

      {onRemove && (
        <button
          type="button"
          title={removeLabel}
          aria-label={removeLabel}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item);
          }}
          className="shrink-0 w-7 h-7 rounded-full bg-surface hover:bg-danger text-ink-secondary hover:text-white border border-tone/10 hover:border-danger flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

interface SeriesListRowProps {
  series: SeriesSummary;
  onSelect: (series: SeriesSummary) => void;
}

export function SeriesListRow({ series, onSelect }: SeriesListRowProps) {
  const isAnime = series.library_kind === 'anime';
  const resBadge = resolutionLabel(series.video_height);
  const hdrBadge = hdrLabel(series.video_hdr);
  const summaryLine =
    series.overview ||
    (series.genres && series.genres.length > 0 ? series.genres.slice(0, 3).join(' · ') : '');

  return (
    <AppLink
      href={seriesPath(series.library_id, series.title)}
      onNavigate={() => onSelect(series)}
      className="group/row w-full flex items-center gap-3.5 rounded-xl bg-surface/40 hover:bg-elevated/70 border border-tone/[0.07] hover:border-tone/20 p-2.5 text-left transition-colors cursor-pointer"
    >
      <div className="relative w-12 h-[72px] shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-elevated via-surface to-canvas border border-tone/[0.06]">
        {series.poster_url ? (
          <img
            src={series.poster_url}
            alt={series.title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover/row:scale-[1.03] transition-transform duration-200"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <LuneMark alt="" className="w-5 h-5 opacity-30" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium tracking-[-0.01em] text-ink truncate">
            {series.title}
          </span>
          {series.year && (
            <span className="text-xs tabular-nums text-ink-secondary shrink-0">
              {series.year}
            </span>
          )}
          {series.content_rating && (
            <span className="px-1.5 py-0.5 rounded bg-tone/[0.06] border border-tone/12 text-[10px] font-medium tabular-nums text-ink-secondary shrink-0">
              {series.content_rating}
            </span>
          )}
        </div>
        {summaryLine && (
          <p className="text-xs text-ink-muted truncate">{summaryLine}</p>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-2.5 shrink-0 tabular-nums">
        {series.rating !== undefined && series.rating > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary">
            <Star className="w-3 h-3 fill-current text-ink-secondary" />
            {series.rating.toFixed(1)}
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
          {isAnime ? <Sparkles className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
          {series.season_count} {series.season_count === 1 ? 'season' : 'seasons'} ·{' '}
          {series.episode_count} {series.episode_count === 1 ? 'episode' : 'episodes'}
        </span>
        <div className="flex items-center gap-1">
          {resBadge && (
            <span className="px-1.5 py-0.5 rounded bg-tone/[0.06] border border-tone/12 text-[10px] font-semibold tracking-wide text-ink-secondary">
              {resBadge}
            </span>
          )}
          {hdrBadge && (
            <span className="px-1.5 py-0.5 rounded bg-tone/[0.06] border border-tone/20 text-[10px] font-semibold tracking-wide text-ink">
              {hdrBadge}
            </span>
          )}
          {series.dual_audio && (
            <span className="px-1.5 py-0.5 rounded bg-[#64D2FF]/10 border border-[#64D2FF]/35 text-[10px] font-semibold tracking-wide text-telemetry">
              DUAL
            </span>
          )}
        </div>
      </div>
    </AppLink>
  );
}
