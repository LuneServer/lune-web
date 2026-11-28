import type { CSSProperties } from 'react';
import type { SubtitleColor, SubtitleSize, SubtitleStyle } from './api';

/** Default look: identical to the original Lune subtitle overlay. */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  size: 'medium',
  color: 'white',
  background: true,
  outline: false,
};

export const SUBTITLE_SIZES: { id: SubtitleSize; label: string }[] = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

export const SUBTITLE_COLORS: { id: SubtitleColor; label: string; swatch: string }[] = [
  { id: 'white', label: 'White', swatch: '#f5f5f7' },
  { id: 'yellow', label: 'Yellow', swatch: '#ffe066' },
  { id: 'cyan', label: 'Cyan', swatch: '#6ee7ff' },
  { id: 'green', label: 'Green', swatch: '#86efac' },
  { id: 'magenta', label: 'Magenta', swatch: '#f9a8d4' },
];

const LEGACY_LS_SUB_SIZE = 'lune_player_sub_size';

/**
 * Resolve the effective style from synced preferences. Before a style has ever been saved,
 * honour the size this browser stored locally under the old player-only setting.
 */
export function resolveSubtitleStyle(stored?: SubtitleStyle | null): SubtitleStyle {
  if (stored) return { ...DEFAULT_SUBTITLE_STYLE, ...stored };
  let size: SubtitleSize = DEFAULT_SUBTITLE_STYLE.size;
  try {
    const legacy = localStorage.getItem(LEGACY_LS_SUB_SIZE);
    if (legacy === 'sm') size = 'small';
    else if (legacy === 'lg') size = 'large';
  } catch {
    // ignore
  }
  return { ...DEFAULT_SUBTITLE_STYLE, size };
}

export function subtitleSizeClass(size: SubtitleSize): string {
  if (size === 'small') return 'text-base sm:text-lg';
  if (size === 'large') return 'text-2xl sm:text-3xl';
  return 'text-lg sm:text-2xl';
}

/** Soft drop shadow used by the original overlay; kept in every style for depth. */
const SOFT_SHADOW = '0 2px 6px rgba(0,0,0,0.9)';
/** Eight-way hairline stroke in em so it scales with the chosen size. */
const OUTLINE_SHADOW = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
]
  .map(([x, y]) => `${x * 0.055}em ${y * 0.055}em 0 rgba(0,0,0,0.95)`)
  .join(', ');

/**
 * Classes for the cue box. White keeps the theme `text-ink` colour exactly as before.
 * Positioned (ASS) cues pass their own width constraint instead of `max-w-3xl`.
 */
export function subtitleBoxClass(style: SubtitleStyle, widthClass = 'max-w-3xl'): string {
  const base = `${subtitleSizeClass(style.size)} font-medium text-center whitespace-pre-line px-4 py-1.5 rounded-lg ${widthClass} leading-snug`;
  const color = style.color === 'white' ? 'text-ink' : '';
  const bg = style.background ? 'bg-canvas/75 backdrop-blur-xs shadow-lg' : '';
  return [base, color, bg].filter(Boolean).join(' ');
}

export function subtitleTextStyle(style: SubtitleStyle): CSSProperties {
  const swatch = SUBTITLE_COLORS.find((c) => c.id === style.color);
  return {
    color: style.color === 'white' ? undefined : swatch?.swatch,
    textShadow: style.outline ? `${OUTLINE_SHADOW}, ${SOFT_SHADOW}` : SOFT_SHADOW,
  };
}
