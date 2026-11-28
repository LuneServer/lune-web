import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import {
  Check,
  Copy,
  Languages,
  Palette,
  PlayCircle,
  ShieldCheck,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { encode as encodeQR } from 'uqr';
import {
  api,
  ApiError,
  type PosterBadge,
  type SubtitleStyle,
  type TOTPSetupResponse,
  type AutoSkipMode,
  type UserPreferences,
} from '../lib/api';
import { POSTER_BADGE_OPTIONS } from '../lib/posterBadges';
import { resolveSubtitleStyle } from '../lib/subtitleStyle';
import { useBodyScrollLock } from '../lib/useBodyScrollLock';
import { AUTO_SKIP_DEFAULTS, SKIP_COUNTDOWN_SECONDS, normalizeAutoSkip } from '../lib/skipSegments';
import { SubtitleStyleControls } from './SubtitleStyleControls';
import { ThemeSwitcher } from './ThemeSwitcher';

interface Props {
  displayName: string;
  initialPrefs?: UserPreferences;
  onClose: () => void;
  onSaved: (displayName: string, prefs: UserPreferences) => void;
}

const LANGUAGES = [
  { code: '', label: 'Auto (Original / Anime JP)' },
  { code: 'ja', label: 'Japanese (日本語)' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
];

type SectionId = 'playback' | 'languages' | 'appearance' | 'account';

const SECTIONS: { id: SectionId; label: string; description: string; icon: LucideIcon }[] = [
  {
    id: 'playback',
    label: 'Playback',
    description: 'Autoplay, chapter markers, and skipping intros & credits.',
    icon: PlayCircle,
  },
  {
    id: 'languages',
    label: 'Audio & Subtitles',
    description: 'Default tracks, anime Sub/Dub behaviour, and how subtitles look.',
    icon: Languages,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme, poster badges, and how Home groups your shows.',
    icon: Palette,
  },
  {
    id: 'account',
    label: 'Account & Security',
    description: 'Your display name and two-factor authentication.',
    icon: UserRound,
  },
];

const selectClass =
  'w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-sm text-ink focus:outline-none focus:border-tone/50 cursor-pointer';
const inputClass =
  'rounded-lg bg-surface border border-hairline px-3 py-2 text-base sm:text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50';

/** 2FA fields live inside the preferences form; Enter there must not save preferences. */
function noSubmitOnEnter(e: ReactKeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') e.preventDefault();
}

/** A titled card of settings rows separated by hairlines. */
function SettingsGroup({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      {title && (
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-ink-secondary">{title}</h3>
      )}
      <div className="rounded-xl bg-canvas/50 border border-tone/[0.08] divide-y divide-tone/[0.06]">{children}</div>
      {footer && <p className="px-1 text-xs text-ink-muted leading-relaxed">{footer}</p>}
    </section>
  );
}

/** One setting: title and description on the left, its control on the right (or below when `stacked`). */
function SettingRow({
  title,
  description,
  control,
  stacked = false,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  stacked?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="px-4 py-3.5 space-y-3">
      <div
        className={
          stacked ? 'space-y-1' : 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-6'
        }
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink">{title}</div>
          {description && <div className="text-xs text-ink-muted mt-0.5 leading-relaxed">{description}</div>}
        </div>
        {control && <div className="shrink-0">{control}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
        checked ? 'bg-accent border-accent' : 'bg-elevated border-hairline'
      }`}
    >
      <span
        className={`inline-block h-4.5 w-4.5 rounded-full transition-transform ${
          checked ? 'translate-x-[22px] bg-on-accent' : 'translate-x-0.5 bg-ink-secondary'
        }`}
      />
    </button>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="px-4 py-3.5 flex items-center justify-between gap-6">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{title}</div>
        <div className="text-xs text-ink-muted mt-0.5 leading-relaxed">{description}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

function PresetCard({
  active,
  title,
  detail,
  onClick,
}: {
  active: boolean;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-xl border px-3.5 py-3 text-left transition-colors cursor-pointer ${
        active
          ? 'bg-tone/12 border-tone/40 text-ink'
          : 'bg-canvas/70 border-hairline text-ink-secondary hover:text-ink'
      }`}
    >
      <div className="text-sm font-semibold flex items-center justify-between gap-2">
        <span>{title}</span>
        {active && <Check className="w-4 h-4 text-ink shrink-0" />}
      </div>
      <div className="text-xs text-ink-muted mt-0.5">{detail}</div>
    </button>
  );
}

export function PreferencesModal({ displayName, initialPrefs, onClose, onSaved }: Props) {
  useBodyScrollLock(true);
  const [section, setSection] = useState<SectionId>('playback');
  const [name, setName] = useState(displayName);
  // The server's preferences PATCH replaces the whole object, so saves start from the
  // last-known preferences and fields this modal doesn't edit (max_bitrate, future ones) survive.
  const [basePrefs, setBasePrefs] = useState<UserPreferences | undefined>(initialPrefs);
  const [audioLang, setAudioLang] = useState(initialPrefs?.audio_language ?? '');
  const [subLang, setSubLang] = useState(initialPrefs?.subtitle_language ?? 'en');
  const [subsEnabled, setSubsEnabled] = useState(initialPrefs?.subtitles_enabled ?? false);
  const [autoplayNext, setAutoplayNext] = useState(initialPrefs?.autoplay_next ?? true);
  const [combineNextUp, setCombineNextUp] = useState(initialPrefs?.combine_next_up ?? true);
  const [showChapterMarkers, setShowChapterMarkers] = useState(
    initialPrefs?.show_chapter_markers ?? true,
  );
  const [posterBadges, setPosterBadges] = useState<PosterBadge[]>(initialPrefs?.poster_badges ?? []);
  const [autoSkipIntro, setAutoSkipIntro] = useState<AutoSkipMode>(
    normalizeAutoSkip(initialPrefs?.auto_skip_intro, AUTO_SKIP_DEFAULTS.intro),
  );
  const [autoSkipRecap, setAutoSkipRecap] = useState<AutoSkipMode>(
    normalizeAutoSkip(initialPrefs?.auto_skip_recap, AUTO_SKIP_DEFAULTS.recap),
  );
  const [autoSkipCredits, setAutoSkipCredits] = useState<AutoSkipMode>(
    normalizeAutoSkip(initialPrefs?.auto_skip_credits, AUTO_SKIP_DEFAULTS.credits),
  );
  const [subStyle, setSubStyle] = useState<SubtitleStyle>(() => resolveSubtitleStyle(initialPrefs?.subtitle_style));
  const subStyleTouchedRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Two-Factor Authentication (TOTP) state
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpSetup, setTotpSetup] = useState<TOTPSetupResponse | null>(null);
  const [totpDisabling, setTotpDisabling] = useState(false);
  const [totpPassword, setTotpPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpError, setTotpError] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [showManualKey, setShowManualKey] = useState(false);
  const totpSectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const qrMatrix = useMemo(() => {
    if (!totpSetup?.otpauth_url) return null;
    return encodeQR(totpSetup.otpauth_url, { ecc: 'M', border: 2 });
  }, [totpSetup?.otpauth_url]);

  const activeSection = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [section]);

  useEffect(() => {
    if (totpSetup || totpDisabling || (recoveryCodes && recoveryCodes.length > 0)) {
      requestAnimationFrame(() => {
        totpSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }, [totpSetup, totpDisabling, recoveryCodes, showManualKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    api
      .getUserProfile()
      .then((profile) => {
        setName(profile.display_name);
        setBasePrefs(profile.preferences);
        setAudioLang(profile.preferences.audio_language ?? '');
        setSubLang(profile.preferences.subtitle_language ?? 'en');
        setSubsEnabled(Boolean(profile.preferences.subtitles_enabled));
        setAutoplayNext(profile.preferences.autoplay_next ?? true);
        setCombineNextUp(profile.preferences.combine_next_up ?? true);
        setShowChapterMarkers(profile.preferences.show_chapter_markers ?? true);
        setPosterBadges(profile.preferences.poster_badges ?? []);
        setAutoSkipIntro(normalizeAutoSkip(profile.preferences.auto_skip_intro, AUTO_SKIP_DEFAULTS.intro));
        setAutoSkipRecap(normalizeAutoSkip(profile.preferences.auto_skip_recap, AUTO_SKIP_DEFAULTS.recap));
        setAutoSkipCredits(normalizeAutoSkip(profile.preferences.auto_skip_credits, AUTO_SKIP_DEFAULTS.credits));
        if (!subStyleTouchedRef.current) setSubStyle(resolveSubtitleStyle(profile.preferences.subtitle_style));
        setTotpEnabled(Boolean(profile.totp_enabled));
        setTotpRequired(Boolean(profile.totp_required));
      })
      .catch(() => {});
  }, []);

  async function handleStartTOTP() {
    setTotpError('');
    setTotpBusy(true);
    try {
      const setup = await api.beginTOTPSetup();
      setTotpSetup(setup);
      setShowManualKey(false);
      setTotpPassword('');
      setTotpCode('');
      setRecoveryCodes(null);
    } catch (err) {
      setTotpError(err instanceof ApiError ? err.message : 'Failed to start 2FA setup');
    } finally {
      setTotpBusy(false);
    }
  }

  async function handleEnableTOTP() {
    setTotpError('');
    setTotpBusy(true);
    try {
      const res = await api.enableTOTP({ password: totpPassword, code: totpCode.trim() });
      setTotpEnabled(res.enabled);
      setRecoveryCodes(res.recovery_codes);
      setTotpSetup(null);
      setTotpPassword('');
      setTotpCode('');
    } catch (err) {
      setTotpError(err instanceof ApiError ? err.message : 'Failed to enable 2FA');
    } finally {
      setTotpBusy(false);
    }
  }

  async function handleDisableTOTP() {
    setTotpError('');
    setTotpBusy(true);
    try {
      await api.disableTOTP({ password: totpPassword, code: totpCode.trim() });
      setTotpEnabled(false);
      setTotpDisabling(false);
      setTotpPassword('');
      setTotpCode('');
      setRecoveryCodes(null);
    } catch (err) {
      setTotpError(err instanceof ApiError ? err.message : 'Failed to disable 2FA');
    } finally {
      setTotpBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const prefs: UserPreferences = {
        ...basePrefs,
        audio_language: audioLang || undefined,
        subtitle_language: subLang || undefined,
        subtitles_enabled: subsEnabled,
        autoplay_next: autoplayNext,
        combine_next_up: combineNextUp,
        show_chapter_markers: showChapterMarkers,
        poster_badges: posterBadges,
        auto_skip_intro: autoSkipIntro,
        auto_skip_recap: autoSkipRecap,
        auto_skip_credits: autoSkipCredits,
        subtitle_style: subStyle,
      };
      const updated = await api.updateUserProfile({
        display_name: name.trim() || displayName,
        preferences: prefs,
      });
      onSaved(updated.display_name, updated.preferences);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }

  const subbedActive = audioLang === '' && subLang === 'en' && !subsEnabled;
  const dubbedActive = audioLang === 'en' && !subsEnabled;

  const skipSelect = (label: string, value: AutoSkipMode, setValue: (v: AutoSkipMode) => void) => (
    <select
      value={value}
      onChange={(e) => setValue(e.target.value as AutoSkipMode)}
      aria-label={label}
      className={`${selectClass} sm:w-56`}
    >
      <option value="off">Off</option>
      <option value="countdown">After {SKIP_COUNTDOWN_SECONDS} seconds</option>
      <option value="instant">Instantly</option>
    </select>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-md flex items-center justify-center sm:p-6"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="prefs-title"
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full h-dvh sm:h-[min(720px,88dvh)] sm:max-w-4xl flex flex-col sm:flex-row overflow-hidden sm:rounded-2xl bg-surface/90 backdrop-blur-xl backdrop-saturate-150 sm:border border-tone/12 shadow-2xl"
      >
        {/* Section rail (sm+) / tab strip (mobile) */}
        <aside className="shrink-0 sm:w-60 border-b sm:border-b-0 sm:border-r border-tone/[0.08] bg-canvas/30 flex flex-col">
          <div className="flex items-center justify-between px-4 pt-4 pb-3 sm:px-5 sm:pt-6 sm:pb-4">
            <div className="min-w-0">
              <h2 id="prefs-title" className="text-lg font-semibold text-ink">
                Preferences
              </h2>
              <p className="text-xs text-ink-muted truncate">{name.trim() || displayName}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="sm:hidden p-2 rounded-lg text-ink-secondary hover:text-ink hover:bg-elevated cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav
            aria-label="Preference sections"
            className="flex sm:flex-col gap-1 overflow-x-auto no-scrollbar px-3 pb-3 sm:pb-4"
          >
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = s.id === section;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setSection(s.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    active ? 'bg-elevated text-ink' : 'text-ink-secondary hover:text-ink hover:bg-canvas/50'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-ink' : 'text-ink-muted'}`} />
                  {s.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Active section */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <header className="hidden sm:flex items-start justify-between gap-4 px-8 pt-6 pb-4">
            <div>
              <h3 className="text-base font-semibold text-ink">{activeSection.label}</h3>
              <p className="text-sm text-ink-secondary mt-0.5">{activeSection.description}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 -mr-2 rounded-lg text-ink-secondary hover:text-ink hover:bg-elevated cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          <div
            ref={contentRef}
            className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-8 sm:pt-2 sm:pb-6 space-y-6"
          >
            {section === 'playback' && (
              <>
                <SettingsGroup title="Player">
                  <ToggleRow
                    title="Autoplay next episode"
                    description="Advance through the Up Next countdown when an episode finishes."
                    checked={autoplayNext}
                    onChange={setAutoplayNext}
                  />
                  <ToggleRow
                    title="Show chapter markers"
                    description="Draw chapter tick marks on the progress bar. Skip buttons still appear when off."
                    checked={showChapterMarkers}
                    onChange={setShowChapterMarkers}
                  />
                </SettingsGroup>

                <SettingsGroup
                  title="Skip intros & credits"
                  footer={
                    <>
                      Skip automatically, or Off to just show the Skip button. Timestamps come from the file&apos;s
                      chapters or IntroDB&apos;s community data. Movie credits are never skipped automatically. Synced
                      to all your devices.
                    </>
                  }
                >
                  <SettingRow title="Skip intro" control={skipSelect('Skip intro', autoSkipIntro, setAutoSkipIntro)} />
                  <SettingRow title="Skip recap" control={skipSelect('Skip recap', autoSkipRecap, setAutoSkipRecap)} />
                  <SettingRow
                    title="Skip credits"
                    description="Episodes only."
                    control={skipSelect('Skip credits', autoSkipCredits, setAutoSkipCredits)}
                  />
                </SettingsGroup>
              </>
            )}

            {section === 'languages' && (
              <>
                <SettingsGroup
                  title="Quick presets"
                  footer={
                    <>
                      Fills the defaults below. <span className="text-ink-secondary">Subbed</span> keeps original
                      audio for movies &amp; TV and plays anime in Japanese with English subs.
                    </>
                  }
                >
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <PresetCard
                      active={subbedActive}
                      title="Subbed (Original + EN)"
                      detail="Original / Anime JP · Auto EN subs"
                      onClick={() => {
                        setAudioLang('');
                        setSubLang('en');
                        setSubsEnabled(false);
                      }}
                    />
                    <PresetCard
                      active={dubbedActive}
                      title="Dubbed (English)"
                      detail="Prefer English audio · Signs & Songs"
                      onClick={() => {
                        setAudioLang('en');
                        setSubLang('en');
                        setSubsEnabled(false);
                      }}
                    />
                  </div>
                </SettingsGroup>

                <SettingsGroup title="Defaults">
                  <SettingRow
                    title="Audio language"
                    control={
                      <select
                        value={audioLang}
                        onChange={(e) => setAudioLang(e.target.value)}
                        aria-label="Preferred audio language"
                        className={`${selectClass} sm:w-64`}
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l.code || 'auto'} value={l.code}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    }
                  />
                  <SettingRow
                    title="Subtitle language"
                    control={
                      <select
                        value={subLang}
                        onChange={(e) => setSubLang(e.target.value)}
                        aria-label="Preferred subtitle language"
                        className={`${selectClass} sm:w-64`}
                      >
                        {LANGUAGES.filter((l) => l.code !== '').map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    }
                  />
                  <ToggleRow
                    title="Always enable full subtitles"
                    description="When off, anime in Japanese still auto-enables subs; English dubs show Signs & Songs."
                    checked={subsEnabled}
                    onChange={setSubsEnabled}
                  />
                </SettingsGroup>

                <SettingsGroup
                  title="Subtitle appearance"
                  footer="Synced to your account, so every Lune app uses the same style."
                >
                  <div className="p-4">
                    <SubtitleStyleControls
                      value={subStyle}
                      onChange={(next) => {
                        subStyleTouchedRef.current = true;
                        setSubStyle(next);
                      }}
                      showPreview
                    />
                  </div>
                </SettingsGroup>
              </>
            )}

            {section === 'appearance' && (
              <>
                <SettingsGroup title="Theme">
                  <SettingRow
                    title="Appearance"
                    description="Match your device setting, or always use Light or Dark."
                    control={<ThemeSwitcher variant="labeled" />}
                  />
                </SettingsGroup>

                <SettingsGroup title="Home">
                  <ToggleRow
                    title="Combine Next Up into Continue Watching"
                    description="Merge upcoming episodes into the Continue Watching shelf, sorted by recent activity."
                    checked={combineNextUp}
                    onChange={setCombineNextUp}
                  />
                </SettingsGroup>

                <SettingsGroup title="Posters">
                  <SettingRow
                    stacked
                    title="Poster badges"
                    description="Choose which metadata pills appear over poster artwork. Default is none."
                    control={
                      posterBadges.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setPosterBadges([])}
                          className="text-xs text-ink-secondary hover:text-ink underline underline-offset-2 cursor-pointer"
                        >
                          Clear all
                        </button>
                      ) : undefined
                    }
                  >
                    <div className="flex flex-wrap gap-2">
                      {POSTER_BADGE_OPTIONS.map((opt) => {
                        const active = posterBadges.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() =>
                              setPosterBadges((prev) =>
                                prev.includes(opt.id) ? prev.filter((b) => b !== opt.id) : [...prev, opt.id],
                              )
                            }
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors cursor-pointer ${
                              active
                                ? 'bg-tone/12 border-tone/40 text-ink font-medium'
                                : 'bg-canvas/70 border-hairline text-ink-secondary hover:text-ink'
                            }`}
                          >
                            {active && <Check className="w-3.5 h-3.5 text-ink shrink-0" />}
                            <span>{opt.label}</span>
                            <span className="text-xs text-ink-muted tabular-nums">{opt.example}</span>
                          </button>
                        );
                      })}
                    </div>
                  </SettingRow>
                </SettingsGroup>
              </>
            )}

            {section === 'account' && (
              <>
                <SettingsGroup title="Profile">
                  <SettingRow
                    title="Display name"
                    description="Shown in the header and to admins in the console."
                    control={
                      <input
                        type="text"
                        value={name}
                        maxLength={64}
                        onChange={(e) => setName(e.target.value)}
                        aria-label="Display name"
                        className={`${inputClass} w-full sm:w-64 bg-canvas`}
                      />
                    }
                  />
                </SettingsGroup>

                <SettingsGroup title="Security">
                  <div ref={totpSectionRef}>
                    <SettingRow
                      title={
                        <span className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-healthy" />
                          Two-factor authentication
                        </span>
                      }
                      description={
                        totpEnabled
                          ? 'Protected with an authenticator app (TOTP).'
                          : 'Require a 6-digit authenticator code when signing in.'
                      }
                      control={
                        <>
                          {!totpEnabled && !totpSetup && (
                            <button
                              type="button"
                              disabled={totpBusy}
                              onClick={handleStartTOTP}
                              className="px-3.5 py-2 rounded-lg bg-elevated hover:bg-hairline border border-tone/12 text-sm font-medium text-ink transition-colors cursor-pointer"
                            >
                              Enable 2FA
                            </button>
                          )}
                          {totpEnabled && !totpDisabling && !totpRequired && (
                            <button
                              type="button"
                              onClick={() => {
                                setTotpDisabling(true);
                                setTotpError('');
                                setTotpPassword('');
                                setTotpCode('');
                              }}
                              className="px-3.5 py-2 rounded-lg bg-danger/10 hover:bg-danger/20 border border-danger/30 text-sm font-medium text-danger transition-colors cursor-pointer"
                            >
                              Disable 2FA
                            </button>
                          )}
                          {totpEnabled && totpRequired && (
                            <span className="px-2.5 py-1 rounded-full bg-healthy/15 text-xs font-medium text-healthy">
                              Required by admin
                            </span>
                          )}
                        </>
                      }
                    >
                      {totpSetup && (
                        <div className="rounded-xl bg-canvas/80 border border-tone/10 p-4 space-y-4">
                          <div className="text-xs text-ink-secondary leading-relaxed">
                            Scan this QR code with your authenticator app (1Password, Apple Passwords, Bitwarden,
                            Google Authenticator), then confirm with your password and a 6-digit code.
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                            {qrMatrix && (
                              <div className="flex flex-col items-center gap-2 shrink-0">
                                <div className="rounded-xl bg-white p-2.5 shadow-sm border border-tone/10">
                                  <svg
                                    viewBox={`0 0 ${qrMatrix.size} ${qrMatrix.size}`}
                                    className="w-40 h-40 block"
                                    shapeRendering="crispEdges"
                                    role="img"
                                    aria-label="Two-factor authentication QR code"
                                  >
                                    <rect width={qrMatrix.size} height={qrMatrix.size} fill="#FFFFFF" />
                                    {qrMatrix.data.map((row, y) =>
                                      row.map((cell, x) =>
                                        cell ? (
                                          <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#09090B" />
                                        ) : null,
                                      ),
                                    )}
                                  </svg>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setShowManualKey((v) => !v)}
                                  className="text-xs text-ink-secondary hover:text-ink underline underline-offset-2 cursor-pointer"
                                >
                                  {showManualKey ? 'Hide setup key' : "Can't scan? Show setup key"}
                                </button>
                              </div>
                            )}

                            <div className="flex-1 min-w-0 space-y-2.5">
                              {showManualKey && (
                                <div className="flex items-center gap-2">
                                  <code className="flex-1 rounded-lg bg-surface border border-hairline px-3 py-2 text-xs font-mono text-ink break-all select-all">
                                    {totpSetup.secret}
                                  </code>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard?.writeText(totpSetup.secret).catch(() => {});
                                      setCopiedSecret(true);
                                      setTimeout(() => setCopiedSecret(false), 1800);
                                    }}
                                    className="p-2 rounded-lg bg-elevated hover:bg-hairline text-ink-secondary hover:text-ink cursor-pointer"
                                    title="Copy secret"
                                  >
                                    {copiedSecret ? (
                                      <Check className="w-4 h-4 text-healthy" />
                                    ) : (
                                      <Copy className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                              )}
                              <input
                                type="password"
                                value={totpPassword}
                                onChange={(e) => setTotpPassword(e.target.value)}
                                onKeyDown={noSubmitOnEnter}
                                placeholder="Current password"
                                autoComplete="current-password"
                                className={`${inputClass} w-full`}
                              />
                              <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                value={totpCode}
                                onChange={(e) => setTotpCode(e.target.value)}
                                onKeyDown={noSubmitOnEnter}
                                placeholder="6-digit code"
                                className={`${inputClass} w-full font-mono tabular-nums`}
                              />
                              <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTotpSetup(null);
                                    setTotpError('');
                                  }}
                                  className="px-3 py-2 rounded-lg text-sm text-ink-secondary hover:text-ink cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={totpBusy || !totpPassword || totpCode.trim().length < 6}
                                  onClick={handleEnableTOTP}
                                  className="px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent font-semibold text-sm cursor-pointer"
                                >
                                  {totpBusy ? 'Verifying…' : 'Verify & Enable'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {totpDisabling && (
                        <div className="rounded-xl bg-canvas/80 border border-danger/25 p-4 space-y-3">
                          <div className="text-xs text-ink-secondary">
                            Confirm your password and a current authenticator (or recovery) code to disable 2FA.
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="password"
                              value={totpPassword}
                              onChange={(e) => setTotpPassword(e.target.value)}
                              onKeyDown={noSubmitOnEnter}
                              placeholder="Current password"
                              autoComplete="current-password"
                              className={inputClass}
                            />
                            <input
                              type="text"
                              value={totpCode}
                              onChange={(e) => setTotpCode(e.target.value)}
                              onKeyDown={noSubmitOnEnter}
                              placeholder="Code or XXXX-XXXX"
                              autoComplete="one-time-code"
                              className={`${inputClass} font-mono`}
                            />
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setTotpDisabling(false);
                                setTotpError('');
                              }}
                              className="px-3 py-2 rounded-lg text-sm text-ink-secondary hover:text-ink cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={totpBusy || !totpPassword || !totpCode.trim()}
                              onClick={handleDisableTOTP}
                              className="px-3.5 py-2 rounded-lg bg-danger text-white font-semibold text-sm disabled:opacity-50 cursor-pointer"
                            >
                              {totpBusy ? 'Disabling…' : 'Confirm Disable'}
                            </button>
                          </div>
                        </div>
                      )}

                      {recoveryCodes && recoveryCodes.length > 0 && (
                        <div className="rounded-xl bg-healthy/10 border border-healthy/30 p-4 space-y-2.5">
                          <div className="text-sm font-semibold text-healthy">
                            2FA enabled. Save your one-time recovery codes
                          </div>
                          <p className="text-xs text-ink-secondary">
                            Store these codes somewhere safe. Each code can be used once if you lose your
                            authenticator device.
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-sm text-ink">
                            {recoveryCodes.map((c) => (
                              <div
                                key={c}
                                className="rounded bg-canvas/80 border border-hairline px-2 py-1.5 text-center select-all"
                              >
                                {c}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {totpError && (
                        <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-sm text-danger">
                          {totpError}
                        </div>
                      )}
                    </SettingRow>
                  </div>
                </SettingsGroup>
              </>
            )}
          </div>

          <footer className="shrink-0 flex items-center justify-end gap-3 px-4 pt-3 sm:px-8 sm:py-4 border-t border-tone/[0.08] bg-canvas/30 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {error && <div className="mr-auto min-w-0 text-sm text-danger truncate">{error}</div>}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-ink-secondary hover:text-ink cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-60 text-on-accent font-semibold text-sm transition-colors cursor-pointer"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </footer>
        </div>
      </form>
    </div>
  );
}
