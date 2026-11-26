import { Layers, Sparkles } from 'lucide-react';
import type { SeriesSummary } from '../lib/api';
import { AppLink, seriesPath } from './AppLink';
import { LuneMark } from './LuneMark';

interface Props {
  series: SeriesSummary;
  onSelect: (series: SeriesSummary) => void;
}

export function SeriesCard({ series, onSelect }: Props) {
  const isAnime = series.library_kind === 'anime';
  return (
    <AppLink
      href={seriesPath(series.library_id, series.title)}
      onNavigate={() => onSelect(series)}
      className="group w-full text-left flex flex-col rounded-xl bg-surface border border-tone/[0.08] hover:border-tone/25 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(0,0,0,0.22)] cursor-pointer"
    >
      <div className="relative aspect-[2/3] w-full bg-gradient-to-br from-elevated via-surface to-canvas overflow-hidden">
        {series.poster_url ? (
          <img
            src={series.poster_url}
            alt={series.title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-5 text-center">
            <LuneMark alt="" className="w-10 h-10 opacity-30 mb-3" />
            <span className="text-xs font-medium text-ink-secondary line-clamp-3">{series.title}</span>
          </div>
        )}

        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/15 tabular-nums text-[10px] font-semibold tracking-wide text-white">
            {isAnime ? <Sparkles className="w-2.5 h-2.5" /> : <Layers className="w-2.5 h-2.5" />}
            {series.season_count} {series.season_count === 1 ? 'Season' : 'Seasons'}
          </div>
          {series.dual_audio && (
            <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md border border-[#64D2FF]/40 tabular-nums text-[10px] font-semibold tracking-wide text-[#64D2FF]">
              DUAL
            </span>
          )}
        </div>
      </div>

      <div className="p-3 flex flex-col gap-0.5">
        <div className="text-sm font-medium tracking-[-0.01em] text-ink truncate">{series.title}</div>
        <div className="flex items-center justify-between text-[11px] text-ink-secondary tabular-nums">
          <span>{series.year ?? (isAnime ? 'Anime' : 'Series')}</span>
          <span className="tabular-nums text-[10.5px] text-ink-muted">
            {series.episode_count} {series.episode_count === 1 ? 'ep' : 'eps'}
          </span>
        </div>
      </div>
    </AppLink>
  );
}
