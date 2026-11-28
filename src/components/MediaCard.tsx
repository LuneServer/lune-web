import { Play, Star, X } from 'lucide-react';
import {
  formatDuration,
  formatResolution,
  type MediaItemSummary,
  type PlaybackProgress,
  type PosterBadge,
} from '../lib/api';
import { usePosterBadges } from '../lib/posterBadges';
import { AppLink, itemPath } from './AppLink';
import { LuneMark } from './LuneMark';

interface Props {
  item: MediaItemSummary;
  progress?: PlaybackProgress;
  posterBadges?: PosterBadge[];
  onSelect: (item: MediaItemSummary) => void;
  onRemove?: (item: MediaItemSummary) => void;
  removeLabel?: string;
}

export function MediaCard({
  item,
  progress,
  posterBadges,
  onSelect,
  onRemove,
  removeLabel = 'Remove',
}: Props) {
  const badges = usePosterBadges(posterBadges);
  // Continue Watching shows the time left rather than the full runtime.
  const totalMS = progress && progress.duration_ms > 0 ? progress.duration_ms : item.duration_ms;
  const remainingMS =
    progress && progress.position_ms > 0 && !progress.completed
      ? Math.max(0, totalMS - progress.position_ms)
      : 0;
  const timeLabel =
    remainingMS > 0
      ? `${formatDuration(remainingMS)} left`
      : item.duration_ms > 0
        ? formatDuration(item.duration_ms)
        : '';
  const resBadge = badges.has('resolution')
    ? formatResolution(item.video_width, item.video_height)
    : '';
  const hdrBadge =
    badges.has('hdr') && item.video_hdr && item.video_hdr !== 'sdr'
      ? item.video_hdr.toUpperCase()
      : '';
  const showDual = badges.has('dual_audio') && Boolean(item.dual_audio);
  const ratingBadge =
    badges.has('rating') && item.rating !== undefined && item.rating > 0
      ? item.rating.toFixed(1)
      : '';
  const hasBadges = Boolean(resBadge || hdrBadge || showDual || ratingBadge);

  const pct =
    progress && progress.duration_ms > 0
      ? Math.min(100, Math.round((progress.position_ms / progress.duration_ms) * 100))
      : 0;

  return (
    <div className="relative group/card w-full">
      <AppLink
        href={itemPath(item.id)}
        onNavigate={() => onSelect(item)}
        className="group w-full text-left flex flex-col rounded-xl bg-surface border border-tone/[0.08] hover:border-tone/25 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(0,0,0,0.22)] cursor-pointer"
      >
        <div className="relative aspect-[2/3] w-full bg-gradient-to-br from-elevated via-surface to-canvas overflow-hidden">
          {item.poster_url ? (
            <img
              src={item.poster_url}
              alt={item.title}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-5 text-center relative">
              <LuneMark alt="" className="w-10 h-10 opacity-30 mb-3" />
              <span className="text-xs font-medium text-ink-secondary line-clamp-3">{item.title}</span>
            </div>
          )}

          {/* Configurable poster metadata pills (default: none) */}
          {hasBadges && (
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap pr-8">
              {resBadge && (
                <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/15 tabular-nums text-[10px] font-semibold tracking-wide text-white">
                  {resBadge}
                </span>
              )}
              {hdrBadge && (
                <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/25 tabular-nums text-[10px] font-semibold tracking-wide text-white">
                  {hdrBadge}
                </span>
              )}
              {showDual && (
                <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md border border-[#64D2FF]/40 tabular-nums text-[10px] font-semibold tracking-wide text-[#64D2FF]">
                  DUAL
                </span>
              )}
              {ratingBadge && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/15 tabular-nums text-[10px] font-semibold tracking-wide text-white">
                  <Star className="w-2.5 h-2.5 fill-current" />
                  {ratingBadge}
                </span>
              )}
            </div>
          )}

          {/* Hover play overlay */}
          <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-11 h-11 rounded-full bg-white text-[#09090B] flex items-center justify-center shadow-lg">
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </div>
          </div>

          {/* Continue watching progress bar */}
          {pct > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-1 bg-black/65">
              <div className="h-full bg-white" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>

        <div className="p-3 flex flex-col gap-0.5">
          <div className="text-sm font-medium tracking-[-0.01em] text-ink truncate">
            {item.series_title ? item.series_title : item.title}
          </div>
          <div className="flex items-center justify-between text-[11px] text-ink-secondary gap-2 tabular-nums">
            <span className="truncate">
              {item.series_title && item.season_number != null && item.episode_number != null
                ? `S${String(item.season_number).padStart(2, '0')}E${String(item.episode_number).padStart(2, '0')} · ${item.title}`
                : item.year ?? item.container?.toUpperCase() ?? 'Media'}
            </span>
            {timeLabel && (
              <span className="tabular-nums text-[10.5px] text-ink-muted shrink-0">
                {timeLabel}
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
          className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/65 hover:bg-danger text-white/85 hover:text-white border border-white/20 hover:border-danger backdrop-blur-md flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover/card:opacity-100 sm:focus-visible:opacity-100 transition-all duration-150 cursor-pointer shadow-md"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
