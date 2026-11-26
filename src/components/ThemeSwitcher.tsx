import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '../lib/theme';

interface Props {
  /** 'compact' shows icon-only segmented pill on sm+ and a cycle icon on mobile; 'labeled' shows text labels too */
  variant?: 'compact' | 'labeled';
  /** Expand labeled variant to fill its container width */
  fullWidth?: boolean;
}

const OPTIONS: { id: ThemePreference; label: string; title: string; icon: typeof Monitor }[] = [
  { id: 'system', label: 'System', title: 'Match device setting', icon: Monitor },
  { id: 'light', label: 'Light', title: 'Light Mode', icon: Sun },
  { id: 'dark', label: 'Dark', title: 'Dark Mode', icon: Moon },
];

export function ThemeSwitcher({ variant = 'compact', fullWidth = false }: Props) {
  const { theme, setTheme, cycleTheme } = useTheme();
  const current = OPTIONS.find((o) => o.id === theme) ?? OPTIONS[0];
  const CurrentIcon = current.icon;

  if (variant === 'labeled') {
    return (
      <div
        role="radiogroup"
        aria-label="Appearance"
        className={`${fullWidth ? 'grid grid-cols-3 w-full' : 'inline-flex'} items-center rounded-full bg-surface/80 backdrop-blur-xl backdrop-saturate-150 border border-tone/10 p-0.5 gap-0.5`}
      >
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = theme === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              title={opt.title}
              onClick={() => setTheme(opt.id)}
              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                active
                  ? 'bg-tone/12 text-ink'
                  : 'text-ink-secondary hover:text-ink'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <>
      {/* Mobile single-tap cycle button */}
      <button
        type="button"
        onClick={cycleTheme}
        title={`Appearance: ${current.label} (click to switch)`}
        aria-label={`Appearance: ${current.label}`}
        className="sm:hidden p-1.5 rounded-full text-ink-secondary hover:text-ink hover:bg-elevated transition-colors cursor-pointer"
      >
        <CurrentIcon className="w-4 h-4" />
      </button>

      {/* Desktop 3-way segmented pill */}
      <div
        role="radiogroup"
        aria-label="Appearance"
        className="hidden sm:inline-flex items-center rounded-full bg-surface/80 border border-tone/10 p-0.5 gap-0.5"
      >
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = theme === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={opt.title}
              title={opt.title}
              onClick={() => setTheme(opt.id)}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                active
                  ? 'bg-tone/12 text-ink'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          );
        })}
      </div>
    </>
  );
}
