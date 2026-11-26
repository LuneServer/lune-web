import { createContext, useContext, useMemo } from 'react';
import type { PosterBadge } from './api';

export interface PosterBadgeOption {
  id: PosterBadge;
  label: string;
  example: string;
}

export const POSTER_BADGE_OPTIONS: PosterBadgeOption[] = [
  { id: 'resolution', label: 'Resolution', example: '4K / 1080p' },
  { id: 'hdr', label: 'HDR / Dolby Vision', example: 'HDR10 / DOVI' },
  { id: 'dual_audio', label: 'Dual Audio', example: 'DUAL' },
  { id: 'seasons', label: 'Season Count', example: '2 Seasons' },
  { id: 'rating', label: 'Rating', example: '★ 8.2' },
];

export const PosterBadgesContext = createContext<PosterBadge[]>([]);

export function usePosterBadges(override?: PosterBadge[]): Set<PosterBadge> {
  const ctx = useContext(PosterBadgesContext);
  const list = override ?? ctx;
  return useMemo(() => new Set(list), [list]);
}
