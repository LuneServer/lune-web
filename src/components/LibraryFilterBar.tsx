import { X } from 'lucide-react';
import type { LibraryFacets, LibraryFilters } from '../lib/api';

interface Props {
  facets: LibraryFacets | null;
  filters: LibraryFilters;
  onChange: (next: LibraryFilters) => void;
  onReset: () => void;
}

export function countActiveFilters(filters: LibraryFilters): number {
  let count = 0;
  if (filters.genre) count++;
  if (filters.content_rating) count++;
  if (filters.year || filters.decade) count++;
  if (filters.min_rating) count++;
  if (filters.watched) count++;
  if (filters.resolution) count++;
  if (filters.hdr) count++;
  if (filters.dual_audio) count++;
  return count;
}

export function LibraryFilterBar({ facets, filters, onChange, onReset }: Props) {
  const activeCount = countActiveFilters(filters);

  const years = facets?.years ?? [];
  const decades = Array.from(new Set(years.map((y) => Math.floor(y / 10) * 10))).sort(
    (a, b) => b - a,
  );
  const showDecades = years.length > 6 && decades.length > 1;

  const yearSelectValue = filters.year
    ? `year:${filters.year}`
    : filters.decade
      ? `decade:${filters.decade}`
      : '';

  function handleYearChange(raw: string) {
    if (!raw) {
      onChange({ ...filters, year: undefined, decade: undefined });
      return;
    }
    if (raw.startsWith('decade:')) {
      const dec = Number(raw.slice(7));
      onChange({ ...filters, decade: dec || undefined, year: undefined });
      return;
    }
    if (raw.startsWith('year:')) {
      const yr = Number(raw.slice(5));
      onChange({ ...filters, year: yr || undefined, decade: undefined });
    }
  }

  const selectClass = (active: boolean) =>
    `min-h-[34px] max-w-full rounded-lg border px-2.5 py-1.5 text-base sm:text-xs tabular-nums transition-colors focus:outline-none cursor-pointer ${
      active
        ? 'bg-tone/12 border-tone/35 text-ink font-medium'
        : 'bg-surface border-hairline text-ink-secondary hover:text-ink hover:border-tone/25'
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {facets && facets.genres.length > 0 && (
        <select
          aria-label="Filter by genre"
          value={filters.genre ?? ''}
          onChange={(e) => onChange({ ...filters, genre: e.target.value || undefined })}
          className={selectClass(Boolean(filters.genre))}
        >
          <option value="">All Genres</option>
          {facets.genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      )}

      {facets && facets.content_ratings.length > 0 && (
        <select
          aria-label="Filter by content rating"
          value={filters.content_rating ?? ''}
          onChange={(e) => onChange({ ...filters, content_rating: e.target.value || undefined })}
          className={selectClass(Boolean(filters.content_rating))}
        >
          <option value="">All Ratings</option>
          {facets.content_ratings.map((cr) => (
            <option key={cr} value={cr}>
              {cr}
            </option>
          ))}
        </select>
      )}

      {years.length > 0 && (
        <select
          aria-label="Filter by year"
          value={yearSelectValue}
          onChange={(e) => handleYearChange(e.target.value)}
          className={selectClass(Boolean(filters.year || filters.decade))}
        >
          <option value="">All Years</option>
          {showDecades ? (
            <>
              <optgroup label="Decades">
                {decades.map((d) => (
                  <option key={`decade:${d}`} value={`decade:${d}`}>
                    {d}s
                  </option>
                ))}
              </optgroup>
              <optgroup label="Years">
                {years.map((y) => (
                  <option key={`year:${y}`} value={`year:${y}`}>
                    {y}
                  </option>
                ))}
              </optgroup>
            </>
          ) : (
            years.map((y) => (
              <option key={`year:${y}`} value={`year:${y}`}>
                {y}
              </option>
            ))
          )}
        </select>
      )}

      <select
        aria-label="Filter by minimum rating"
        value={filters.min_rating ? String(filters.min_rating) : ''}
        onChange={(e) =>
          onChange({
            ...filters,
            min_rating: e.target.value ? Number(e.target.value) : undefined,
          })
        }
        className={selectClass(Boolean(filters.min_rating))}
      >
        <option value="">Any Score</option>
        <option value="7">7.0+</option>
        <option value="8">8.0+</option>
        <option value="9">9.0+</option>
      </select>

      <select
        aria-label="Filter by watch status"
        value={filters.watched ?? ''}
        onChange={(e) =>
          onChange({
            ...filters,
            watched: (e.target.value || undefined) as LibraryFilters['watched'],
          })
        }
        className={selectClass(Boolean(filters.watched))}
      >
        <option value="">All Status</option>
        <option value="unwatched">Unwatched</option>
        <option value="watched">Watched</option>
      </select>

      {facets?.has_4k && (
        <button
          type="button"
          onClick={() =>
            onChange({
              ...filters,
              resolution: filters.resolution === '4k' ? undefined : '4k',
            })
          }
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium tabular-nums transition-colors cursor-pointer ${
            filters.resolution === '4k'
              ? 'bg-tone/12 border-tone/40 text-ink'
              : 'bg-surface border-hairline text-ink-secondary hover:text-ink hover:border-tone/25'
          }`}
        >
          4K
        </button>
      )}

      {facets?.has_hdr && (
        <button
          type="button"
          onClick={() =>
            onChange({
              ...filters,
              hdr: filters.hdr ? undefined : true,
            })
          }
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium tabular-nums transition-colors cursor-pointer ${
            filters.hdr
              ? 'bg-tone/12 border-tone/40 text-ink'
              : 'bg-surface border-hairline text-ink-secondary hover:text-ink hover:border-tone/25'
          }`}
        >
          HDR
        </button>
      )}

      {facets?.has_dual_audio && (
        <button
          type="button"
          onClick={() =>
            onChange({
              ...filters,
              dual_audio: filters.dual_audio ? undefined : true,
            })
          }
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
            filters.dual_audio
              ? 'bg-[#64D2FF]/15 border-[#64D2FF]/45 text-telemetry'
              : 'bg-surface border-hairline text-ink-secondary hover:text-ink hover:border-tone/25'
          }`}
        >
          Dual Audio
        </button>
      )}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-ink-secondary hover:text-ink hover:bg-elevated transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          <span>Clear</span>
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-tone/12 text-[10px] font-semibold tabular-nums text-ink">
            {activeCount}
          </span>
        </button>
      )}
    </div>
  );
}
