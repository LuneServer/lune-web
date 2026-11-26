import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Loader2, Search, Star, X } from 'lucide-react';
import { api, type MetadataSearchResult } from '../lib/api';
import { useBodyScrollLock } from '../lib/useBodyScrollLock';
import { LuneMark } from './LuneMark';

interface Props {
  kind: 'movie' | 'tv';
  heading: string;
  subtitle?: string;
  initialQuery: string;
  initialYear?: number;
  currentTMDBID?: string;
  onSelectCandidate: (candidate: MetadataSearchResult) => Promise<void>;
  onClose: () => void;
}

export function IdentifyModal({
  kind,
  heading,
  subtitle,
  initialQuery,
  initialYear,
  currentTMDBID,
  onSelectCandidate,
  onClose,
}: Props) {
  useBodyScrollLock(true);
  const [query, setQuery] = useState(initialQuery);
  const [year, setYear] = useState('');
  const [results, setResults] = useState<MetadataSearchResult[]>([]);
  const [configured, setConfigured] = useState(true);
  const [searching, setSearching] = useState(false);
  const [applyingID, setApplyingID] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const runSearch = useCallback(
    async (qText: string, yText: string) => {
      const trimmed = qText.trim();
      if (!trimmed) return;
      setSearching(true);
      setError('');
      try {
        const parsedYear = yText.trim() ? Number(yText.trim()) : undefined;
        const res = await api.searchMetadata({
          kind,
          q: trimmed,
          year: parsedYear && !Number.isNaN(parsedYear) ? parsedYear : undefined,
        });
        setConfigured(res.configured);
        setResults(res.results);
        setHasSearched(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Metadata search failed');
      } finally {
        setSearching(false);
      }
    },
    [kind],
  );

  // Auto-search on open so candidates appear immediately with zero extra click.
  useEffect(() => {
    if (initialQuery.trim()) {
      runSearch(initialQuery, '');
    }
  }, [initialQuery, runSearch]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !applyingID) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyingID, onClose]);

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    runSearch(query, year);
  }

  async function handlePick(candidate: MetadataSearchResult) {
    if (applyingID) return;
    setApplyingID(candidate.tmdb_id);
    setError('');
    try {
      await onSelectCandidate(candidate);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply selected match');
      setApplyingID(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-md flex items-center justify-center p-4"
      onClick={() => {
        if (!applyingID) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-2xl bg-surface/92 backdrop-blur-xl backdrop-saturate-150 border border-tone/12 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3.5 sm:pb-4 border-b border-tone/[0.08] flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              Identify &amp; Re-Match
            </div>
            <h2 className="text-base font-semibold text-ink truncate mt-0.5">{heading}</h2>
            {subtitle && <p className="text-xs text-ink-secondary mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            disabled={Boolean(applyingID)}
            onClick={onClose}
            aria-label="Close Identify dialog"
            className="p-1.5 rounded-lg text-ink-secondary hover:text-ink hover:bg-elevated transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-tone/[0.08] flex flex-col sm:flex-row gap-2.5 shrink-0"
        >
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={kind === 'tv' ? 'Search TV or Anime title…' : 'Search movie title…'}
              className="w-full rounded-lg bg-canvas border border-hairline pl-8 pr-3 py-2 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
            />
          </div>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder={initialYear ? `Year (${initialYear})` : 'Year (opt)'}
            className="w-full sm:w-28 rounded-lg bg-canvas border border-hairline px-3 py-2 text-xs tabular-nums text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
          />
          <button
            type="submit"
            disabled={searching || Boolean(applyingID) || !query.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent font-semibold text-xs px-4 py-2 transition-colors cursor-pointer shrink-0"
          >
            {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Search
          </button>
        </form>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
          {error && (
            <div className="rounded-lg bg-danger/10 border border-danger/30 px-3.5 py-2.5 text-xs text-danger">
              {error}
            </div>
          )}

          {!configured ? (
            <div className="py-10 text-center space-y-1">
              <div className="text-sm font-medium text-ink">TMDB Enricher Not Configured</div>
              <p className="text-xs text-ink-secondary max-w-md mx-auto">
                Set <span className="font-mono">LUNE_TMDB_API_KEY</span> or{' '}
                <span className="font-mono">LUNE_TMDB_BASE_URL</span> to search and identify titles visually.
              </p>
            </div>
          ) : searching && results.length === 0 ? (
            <div className="py-12 flex items-center justify-center gap-2 text-xs text-ink-secondary">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching TMDB…
            </div>
          ) : hasSearched && results.length === 0 ? (
            <div className="py-12 text-center text-xs text-ink-secondary">
              No matching {kind === 'tv' ? 'series' : 'movies'} found on TMDB. Try a shorter or original title.
            </div>
          ) : (
            results.map((cand) => {
              const isCurrent = Boolean(currentTMDBID && cand.tmdb_id === currentTMDBID);
              const isApplying = applyingID === cand.tmdb_id;
              return (
                <button
                  key={cand.tmdb_id}
                  type="button"
                  disabled={Boolean(applyingID)}
                  onClick={() => handlePick(cand)}
                  className={`group w-full text-left rounded-xl p-3 border transition-all flex gap-3.5 items-start cursor-pointer disabled:cursor-wait ${
                    isCurrent
                      ? 'bg-tone/[0.06] border-telemetry/45 hover:border-telemetry'
                      : 'bg-canvas/60 hover:bg-elevated border-tone/[0.08] hover:border-tone/25'
                  }`}
                >
                  {/* Candidate Poster */}
                  <div className="w-14 sm:w-16 shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-surface border border-tone/[0.08] flex items-center justify-center">
                    {cand.poster_url ? (
                      <img
                        src={cand.poster_url}
                        alt={cand.title}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <LuneMark alt="" className="w-6 h-6 opacity-30" />
                    )}
                  </div>

                  {/* Candidate Details */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ink truncate group-hover:underline">
                          {cand.title}
                        </div>
                        {cand.original_title && (
                          <div className="text-[11px] text-ink-muted truncate">{cand.original_title}</div>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-telemetry/15 text-telemetry text-[10px] font-semibold">
                            <Check className="w-3 h-3" />
                            Current
                          </span>
                        )}
                        {isApplying ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent text-on-accent text-[11px] font-semibold">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Applying…
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg bg-surface group-hover:bg-accent text-ink-secondary group-hover:text-on-accent border border-tone/10 group-hover:border-accent text-[11px] font-semibold transition-colors">
                            Select
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] tabular-nums text-ink-secondary">
                      {cand.year && <span>{cand.year}</span>}
                      {cand.rating && cand.rating > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-warning">
                          <Star className="w-3 h-3 fill-current" />
                          {cand.rating.toFixed(1)}
                        </span>
                      ) : null}
                      <span className="text-ink-muted">TMDB #{cand.tmdb_id}</span>
                    </div>

                    {cand.overview && (
                      <p className="text-xs text-ink-secondary leading-relaxed line-clamp-2 pt-0.5">
                        {cand.overview}
                      </p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
