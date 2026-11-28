import type { AutoSkipMode, ChapterInfo, SkipSegment, UserPreferences } from './api';

/** Seconds an auto-skip countdown runs before skipping. */
export const SKIP_COUNTDOWN_SECONDS = 5;
/** Auto-skip doesn't fire when less than this much of the segment is left. */
const MIN_REMAINING_MS = 2000;

export const AUTO_SKIP_DEFAULTS = {
  intro: 'countdown',
  recap: 'countdown',
  credits: 'off',
} as const satisfies Record<string, AutoSkipMode>;

const SKIPPABLE = new Set(['intro', 'recap', 'outro', 'preview']);

export function segmentId(seg: SkipSegment): string {
  return `${seg.kind}-${seg.start_ms}`;
}

export function isCredits(seg: SkipSegment): boolean {
  return seg.kind === 'outro' || seg.kind === 'preview';
}

/** Whether the segment runs to (within 3 s of) the end, so skipping it ends playback. */
export function reachesEnd(seg: SkipSegment, durationMs: number): boolean {
  return durationMs > 0 && seg.end_ms >= durationMs - 3000;
}

export function skipLabel(seg: SkipSegment): string {
  switch (seg.kind) {
    case 'intro':
      return 'Skip Intro';
    case 'recap':
      return 'Skip Recap';
    case 'outro':
      return 'Skip Credits';
    case 'preview':
      return 'Skip Preview';
  }
}

export function countdownLabel(seg: SkipSegment, seconds: number): string {
  const noun = { intro: 'Intro', recap: 'Recap', outro: 'Credits', preview: 'Preview' }[seg.kind];
  return `Skipping ${noun} in ${seconds}`;
}

/** Skippable chapters as segments, for servers that predate PlaybackPlan.segments. */
export function segmentsFromChapters(chapters: ChapterInfo[]): SkipSegment[] {
  const out: SkipSegment[] = [];
  for (const ch of chapters) {
    if (!SKIPPABLE.has(ch.kind) || ch.end_ms <= ch.start_ms) continue;
    const last = out[out.length - 1];
    if (last && last.kind === ch.kind && ch.start_ms - last.end_ms <= 1000) {
      last.end_ms = Math.max(last.end_ms, ch.end_ms);
      continue;
    }
    out.push({ kind: ch.kind as SkipSegment['kind'], start_ms: ch.start_ms, end_ms: ch.end_ms, source: 'chapter' });
  }
  return out;
}

export function normalizeAutoSkip(mode: string | undefined, fallback: AutoSkipMode): AutoSkipMode {
  return mode === 'off' || mode === 'countdown' || mode === 'instant' ? mode : fallback;
}

export interface AutoSkipPolicy {
  intro: AutoSkipMode;
  recap: AutoSkipMode;
  credits: AutoSkipMode;
  /** Credits only auto-skip for episodes; movie credits are never skipped automatically. */
  isEpisode: boolean;
  /** A next episode exists and autoplay is on, so credits that run to the end may advance. */
  canAdvanceToNext: boolean;
}

export function policyFromPreferences(
  prefs: UserPreferences | undefined,
  isEpisode: boolean,
  canAdvanceToNext: boolean,
): AutoSkipPolicy {
  return {
    intro: normalizeAutoSkip(prefs?.auto_skip_intro, AUTO_SKIP_DEFAULTS.intro),
    recap: normalizeAutoSkip(prefs?.auto_skip_recap, AUTO_SKIP_DEFAULTS.recap),
    credits: normalizeAutoSkip(prefs?.auto_skip_credits, AUTO_SKIP_DEFAULTS.credits),
    isEpisode,
    canAdvanceToNext,
  };
}

function modeFor(policy: AutoSkipPolicy, seg: SkipSegment, durationMs: number): AutoSkipMode {
  switch (seg.kind) {
    case 'intro':
      return policy.intro;
    case 'recap':
      return policy.recap;
    default:
      if (!policy.isEpisode) return 'off';
      if (reachesEnd(seg, durationMs) && !policy.canAdvanceToNext) return 'off';
      return policy.credits;
  }
}

export interface SkipState {
  segment: SkipSegment | null;
  /** Whole seconds left on a running auto-skip countdown. */
  countdown: number | null;
  /** Auto-skip fired: skip `segment` now (once), then mark it handled. */
  skipNow: boolean;
  /** Skipping `segment` ends the media (credits to the end). */
  endsPlayback: boolean;
}

export const NO_SKIP: SkipState = { segment: null, countdown: null, skipNow: false, endsPlayback: false };

export function sameSkipState(a: SkipState, b: SkipState): boolean {
  return (
    a.segment === b.segment && a.countdown === b.countdown && a.skipNow === b.skipNow && a.endsPlayback === b.endsPlayback
  );
}

/**
 * Tracks the segment under the playhead and drives auto-skip (mirrors lune-apple's
 * SkipSegmentTracker). Countdowns run on the playhead, so pausing pauses them. A segment
 * auto-skips at most once per playback: once skipped or cancelled it only shows the button.
 */
export class SkipSegmentTracker {
  private segments: SkipSegment[];
  private handled = new Set<string>();
  private anchor: { id: string; ms: number } | null = null;

  constructor(segments: SkipSegment[] = []) {
    this.segments = segments
      .filter((s) => SKIPPABLE.has(s.kind) && s.end_ms > s.start_ms)
      .sort((a, b) => a.start_ms - b.start_ms);
  }

  markHandled(seg: SkipSegment): void {
    this.handled.add(segmentId(seg));
    if (this.anchor?.id === segmentId(seg)) this.anchor = null;
  }

  update(positionMs: number, durationMs: number, policy: AutoSkipPolicy): SkipState {
    const seg = this.segments.find((s) => positionMs >= s.start_ms && positionMs < s.end_ms) ?? null;
    if (!seg) {
      this.anchor = null;
      return NO_SKIP;
    }
    const id = segmentId(seg);
    const endsPlayback = isCredits(seg) && reachesEnd(seg, durationMs);
    const buttonOnly: SkipState = { segment: seg, countdown: null, skipNow: false, endsPlayback };
    if (this.handled.has(id)) return buttonOnly;

    const mode = modeFor(policy, seg, durationMs);
    const effectiveEnd = durationMs > 0 ? Math.min(seg.end_ms, durationMs) : seg.end_ms;
    if (mode === 'off' || (!endsPlayback && effectiveEnd - positionMs < MIN_REMAINING_MS)) {
      this.anchor = null;
      return buttonOnly;
    }
    if (mode === 'instant') return { segment: seg, countdown: null, skipNow: true, endsPlayback };

    if (this.anchor?.id !== id || positionMs < this.anchor.ms) this.anchor = { id, ms: positionMs };
    const remainingMs = SKIP_COUNTDOWN_SECONDS * 1000 - (positionMs - this.anchor.ms);
    if (remainingMs <= 0) return { segment: seg, countdown: 0, skipNow: true, endsPlayback };
    return { segment: seg, countdown: Math.ceil(remainingMs / 1000), skipNow: false, endsPlayback };
  }
}
