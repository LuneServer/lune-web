import { Check } from 'lucide-react';
import type { SubtitleStyle } from '../lib/api';
import {
  SUBTITLE_COLORS,
  SUBTITLE_SIZES,
  subtitleBoxClass,
  subtitleTextStyle,
} from '../lib/subtitleStyle';

interface Props {
  value: SubtitleStyle;
  onChange: (next: SubtitleStyle) => void;
  /** Show a live sample cue (used in Preferences, where no video is playing). */
  showPreview?: boolean;
  /** Dense layout for the in-player popover. */
  compact?: boolean;
}

export function SubtitleStyleControls({ value, onChange, showPreview, compact }: Props) {
  const heading = compact
    ? 'text-[10px] font-semibold uppercase tracking-widest text-ink-secondary mb-2'
    : 'text-xs font-medium text-ink mb-1.5';
  const set = (patch: Partial<SubtitleStyle>) => onChange({ ...value, ...patch });

  return (
    <div className={compact ? 'space-y-3' : 'space-y-3.5'}>
      {showPreview && (
        <div
          data-theme="dark"
          aria-hidden="true"
          className="relative h-24 rounded-xl overflow-hidden border border-hairline bg-[radial-gradient(ellipse_at_30%_20%,#3a4a6b,transparent_60%),linear-gradient(160deg,#1b2233,#0b0d14_70%)] flex items-end justify-center pb-3"
        >
          <div className={subtitleBoxClass(value)} style={subtitleTextStyle(value)}>
            The moon looks closer tonight.
          </div>
        </div>
      )}

      <div>
        <div className={heading}>Text Size</div>
        <div className="grid grid-cols-3 gap-1.5">
          {SUBTITLE_SIZES.map((sz) => (
            <button
              key={sz.id}
              type="button"
              onClick={() => set({ size: sz.id })}
              aria-pressed={value.size === sz.id}
              className={`py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                value.size === sz.id
                  ? 'bg-accent text-on-accent'
                  : 'bg-surface text-ink-secondary hover:text-ink'
              }`}
            >
              {sz.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className={heading}>Colour</div>
        <div className="flex items-center gap-2">
          {SUBTITLE_COLORS.map((c) => {
            const active = value.color === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => set({ color: c.id })}
                title={c.label}
                aria-label={c.label}
                aria-pressed={active}
                className={`relative w-7 h-7 rounded-full border cursor-pointer transition-transform ${
                  active ? 'border-white scale-110 ring-2 ring-accent/60' : 'border-white/25 hover:scale-105'
                }`}
                style={{ background: c.swatch }}
              >
                {active && <Check className="absolute inset-0 m-auto w-3.5 h-3.5 text-black/75" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <ToggleChip label="Background" on={value.background} onClick={() => set({ background: !value.background })} />
        <ToggleChip label="Outline" on={value.outline} onClick={() => set({ outline: !value.outline })} />
      </div>
    </div>
  );
}

function ToggleChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
        on ? 'bg-accent/20 text-ink ring-1 ring-accent/50' : 'bg-surface text-ink-secondary hover:text-ink'
      }`}
    >
      <span>{label}</span>
      <span
        className={`relative inline-block w-6 h-3.5 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-white/20'}`}
      >
        <span
          className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${on ? 'left-3' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}
