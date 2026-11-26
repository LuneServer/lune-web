import { useEffect, useState } from 'react';
import type { CreditPerson } from '../lib/api';
import { MediaShelf } from './MediaShelf';

const RETRY_DELAYS_MS = [800, 2000];

interface Props {
  title?: string;
  people: CreditPerson[];
  onSelectPerson?: (name: string) => void;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function PersonCard({
  person,
  onSelect,
}: {
  person: CreditPerson;
  onSelect?: (name: string) => void;
}) {
  const [retryCount, setRetryCount] = useState(0);
  const [imgState, setImgState] = useState<'loading' | 'retrying' | 'failed'>('loading');

  useEffect(() => {
    setRetryCount(0);
    setImgState('loading');
  }, [person.photo_url]);

  useEffect(() => {
    if (imgState !== 'retrying') return;
    const delay = RETRY_DELAYS_MS[retryCount] ?? 2000;
    const timer = window.setTimeout(() => {
      setRetryCount((c) => c + 1);
      setImgState('loading');
    }, delay);
    return () => window.clearTimeout(timer);
  }, [imgState, retryCount]);

  const imgSrc =
    person.photo_url && retryCount > 0
      ? `${person.photo_url}${person.photo_url.includes('?') ? '&' : '?'}retry=${retryCount}`
      : person.photo_url;

  const handleImgError = () => {
    if (retryCount < RETRY_DELAYS_MS.length) {
      setImgState('retrying');
    } else {
      setImgState('failed');
    }
  };

  const inner = (
    <>
      <div className="aspect-[3/4] w-full rounded-xl overflow-hidden bg-gradient-to-br from-elevated via-surface to-canvas border border-tone/[0.08] group-hover:border-tone/25 transition-colors flex items-center justify-center">
        {imgSrc && imgState === 'loading' ? (
          <img
            src={imgSrc}
            alt={person.name}
            loading="lazy"
            decoding="async"
            onError={handleImgError}
            className="w-full h-full object-cover object-top group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <span className="text-lg font-semibold tracking-wider text-ink-muted select-none">
            {initialsFor(person.name)}
          </span>
        )}
      </div>
      <div className="px-0.5 space-y-0.5 text-left">
        <div className="text-xs font-semibold text-ink leading-snug line-clamp-2 group-hover:underline">
          {person.name}
        </div>
        {person.role && (
          <div className="text-[11px] text-ink-secondary leading-snug line-clamp-2">{person.role}</div>
        )}
      </div>
    </>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={() => onSelect(person.name)}
        className="group w-[116px] sm:w-[132px] shrink-0 snap-start flex flex-col gap-2 cursor-pointer text-left"
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="w-[116px] sm:w-[132px] shrink-0 snap-start flex flex-col gap-2">{inner}</div>
  );
}

export function CastShelf({ title = 'Cast & Crew', people, onSelectPerson }: Props) {
  if (!people || people.length === 0) return null;

  return (
    <MediaShelf
      itemCount={people.length}
      header={
        <h2 className="text-base font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      }
    >
      {people.map((person, idx) => (
        <PersonCard
          key={`${person.name}-${person.role ?? ''}-${person.photo_url ?? ''}-${idx}`}
          person={person}
          onSelect={onSelectPerson}
        />
      ))}
    </MediaShelf>
  );
}
