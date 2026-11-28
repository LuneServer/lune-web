import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Languages, Sparkles, Subtitles, X, Check, ShieldCheck, Copy, Tags } from 'lucide-react';
import { encode as encodeQR } from 'uqr';
import {
  api,
  ApiError,
  type PosterBadge,
  type TOTPSetupResponse,
  type AutoSkipMode,
  type UserPreferences,
} from '../lib/api';
import { POSTER_BADGE_OPTIONS } from '../lib/posterBadges';
import { useBodyScrollLock } from '../lib/useBodyScrollLock';
import { AUTO_SKIP_DEFAULTS, SKIP_COUNTDOWN_SECONDS, normalizeAutoSkip } from '../lib/skipSegments';
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

export function PreferencesModal({ displayName, initialPrefs, onClose, onSaved }: Props) {
  useBodyScrollLock(true);
  const [name, setName] = useState(displayName);
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

  const qrMatrix = useMemo(() => {
    if (!totpSetup?.otpauth_url) return null;
    return encodeQR(totpSetup.otpauth_url, { ecc: 'M', border: 2 });
  }, [totpSetup?.otpauth_url]);

  useEffect(() => {
    if (totpSetup || totpDisabling || (recoveryCodes && recoveryCodes.length > 0)) {
      requestAnimationFrame(() => {
        totpSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    }
  }, [totpSetup, totpDisabling, recoveryCodes, showManualKey]);

  useEffect(() => {
    api
      .getUserProfile()
      .then((profile) => {
        setName(profile.display_name);
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
        audio_language: audioLang || undefined,
        subtitle_language: subLang || undefined,
        subtitles_enabled: subsEnabled,
        autoplay_next: autoplayNext,
        max_bitrate: initialPrefs?.max_bitrate,
        combine_next_up: combineNextUp,
        show_chapter_markers: showChapterMarkers,
        poster_badges: posterBadges,
        auto_skip_intro: autoSkipIntro,
        auto_skip_recap: autoSkipRecap,
        auto_skip_credits: autoSkipCredits,
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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-surface/88 backdrop-blur-xl backdrop-saturate-150 border border-tone/12 shadow-2xl p-4 sm:p-6 space-y-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Playback Preferences</h2>
            <p className="text-xs text-ink-secondary mt-0.5">
              Customize default audio, subtitles, and anime Sub/Dub behavior.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-secondary hover:text-ink hover:bg-elevated cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Appearance */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-tone/[0.08]">
          <div>
            <div className="text-xs font-medium text-ink">Appearance</div>
            <div className="text-[11px] text-ink-muted">Match device setting, Light, or Dark.</div>
          </div>
          <ThemeSwitcher variant="labeled" />
        </div>

        {/* One-click Language Presets */}
        <div className="space-y-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-secondary flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-ink" />
              Quick Audio &amp; Anime Presets
            </div>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Fills the defaults below. <span className="text-ink-secondary">Subbed</span> keeps
              original audio for movies/TV and plays anime in Japanese with English subs.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setAudioLang('');
                setSubLang('en');
                setSubsEnabled(false);
              }}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                audioLang === '' && subLang === 'en' && !subsEnabled
                  ? 'bg-tone/12 border-tone/40 text-ink'
                  : 'bg-canvas/70 border-hairline text-ink-secondary hover:text-ink'
              }`}
            >
              <div className="text-xs font-semibold flex items-center justify-between">
                <span>Subbed (Original + EN)</span>
                {audioLang === '' && subLang === 'en' && !subsEnabled && (
                  <Check className="w-3.5 h-3.5 text-ink" />
                )}
              </div>
              <div className="text-[10px] text-ink-muted mt-0.5">
                Original / Anime JP · Auto EN subs
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setAudioLang('en');
                setSubLang('en');
                setSubsEnabled(false);
              }}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                audioLang === 'en' && !subsEnabled
                  ? 'bg-tone/12 border-tone/40 text-ink'
                  : 'bg-canvas/70 border-hairline text-ink-secondary hover:text-ink'
              }`}
            >
              <div className="text-xs font-semibold flex items-center justify-between">
                <span>Dubbed (English)</span>
                {audioLang === 'en' && !subsEnabled && (
                  <Check className="w-3.5 h-3.5 text-ink" />
                )}
              </div>
              <div className="text-[10px] text-ink-muted mt-0.5">
                Prefer English audio · Signs &amp; Songs
              </div>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5 text-ink-secondary" />
              Preferred Audio Language
            </label>
            <select
              value={audioLang}
              onChange={(e) => setAudioLang(e.target.value)}
              className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs text-ink focus:outline-none focus:border-tone/50"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code || 'auto'} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink flex items-center gap-1.5">
              <Subtitles className="w-3.5 h-3.5 text-ink-secondary" />
              Preferred Subtitle Language
            </label>
            <select
              value={subLang}
              onChange={(e) => setSubLang(e.target.value)}
              className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs text-ink focus:outline-none focus:border-tone/50"
            >
              {LANGUAGES.filter((l) => l.code !== '').map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2.5 pt-1">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <div className="text-xs font-medium text-ink">Always enable full subtitles</div>
                <div className="text-[11px] text-ink-muted">
                  When off, anime in Japanese still auto-enables subs; English dubs show Signs &amp; Songs.
                </div>
              </div>
              <input
                type="checkbox"
                checked={subsEnabled}
                onChange={(e) => setSubsEnabled(e.target.checked)}
                className="accent-accent w-4 h-4 shrink-0"
              />
            </label>

            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <div className="text-xs font-medium text-ink">Autoplay next episode</div>
                <div className="text-[11px] text-ink-muted">
                  Automatically advance through Up Next countdown when an episode finishes.
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoplayNext}
                onChange={(e) => setAutoplayNext(e.target.checked)}
                className="accent-accent w-4 h-4 shrink-0"
              />
            </label>

            <div className="flex items-center justify-between gap-3 pt-1 border-t border-tone/[0.06]">
              <div>
                <div className="text-xs font-medium text-ink">
                  Combine Next Up into Continue Watching
                </div>
                <div className="text-[11px] text-ink-muted">
                  Merge upcoming episodes into the Continue Watching shelf, sorted by recent activity.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={combineNextUp}
                aria-label="Combine Next Up into Continue Watching"
                onClick={() => setCombineNextUp((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                  combineNextUp
                    ? 'bg-accent border-accent'
                    : 'bg-elevated border-hairline'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                    combineNextUp
                      ? 'translate-x-[18px] bg-on-accent'
                      : 'translate-x-0.5 bg-ink-secondary'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1 border-t border-tone/[0.06]">
              <div>
                <div className="text-xs font-medium text-ink">Show chapter markers</div>
                <div className="text-[11px] text-ink-muted">
                  Draw chapter tick marks on the player&apos;s progress bar. Skip Intro still works when off.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showChapterMarkers}
                aria-label="Show chapter markers"
                onClick={() => setShowChapterMarkers((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                  showChapterMarkers
                    ? 'bg-accent border-accent'
                    : 'bg-elevated border-hairline'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                    showChapterMarkers
                      ? 'translate-x-[18px] bg-on-accent'
                      : 'translate-x-0.5 bg-ink-secondary'
                  }`}
                />
              </button>
            </div>

            <div className="pt-2.5 border-t border-tone/[0.06] space-y-2">
              <div>
                <div className="text-xs font-medium text-ink">Skip intros &amp; credits</div>
                <div className="text-[11px] text-ink-muted">
                  From the file&apos;s chapters or IntroDB&apos;s community timestamps. Credits apply to episodes only;
                  movie credits are never skipped automatically. Synced to all your devices.
                </div>
              </div>
              {(
                [
                  ['Intro', autoSkipIntro, setAutoSkipIntro],
                  ['Recap', autoSkipRecap, setAutoSkipRecap],
                  ['Credits', autoSkipCredits, setAutoSkipCredits],
                ] as const
              ).map(([label, value, setValue]) => (
                <label key={label} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-ink-secondary">{label}</span>
                  <select
                    value={value}
                    onChange={(e) => setValue(e.target.value as AutoSkipMode)}
                    aria-label={`Auto-skip ${label.toLowerCase()}`}
                    className="w-44 rounded-lg bg-canvas border border-hairline px-3 py-1.5 text-base sm:text-xs text-ink focus:outline-none focus:border-tone/50"
                  >
                    <option value="off">Show Skip button</option>
                    <option value="countdown">Skip after {SKIP_COUNTDOWN_SECONDS} seconds</option>
                    <option value="instant">Skip instantly</option>
                  </select>
                </label>
              ))}
            </div>

            <div className="pt-2.5 border-t border-tone/[0.06] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-ink flex items-center gap-1.5">
                    <Tags className="w-3.5 h-3.5 text-ink-secondary" />
                    Poster Badges
                  </div>
                  <div className="text-[11px] text-ink-muted">
                    Choose which metadata pills appear over poster artwork. Default is none.
                  </div>
                </div>
                {posterBadges.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPosterBadges([])}
                    className="text-[11px] text-ink-secondary hover:text-ink underline underline-offset-2 shrink-0 cursor-pointer"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {POSTER_BADGE_OPTIONS.map((opt) => {
                  const active = posterBadges.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setPosterBadges((prev) =>
                          prev.includes(opt.id)
                            ? prev.filter((b) => b !== opt.id)
                            : [...prev, opt.id],
                        )
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                        active
                          ? 'bg-tone/12 border-tone/40 text-ink font-medium'
                          : 'bg-canvas/70 border-hairline text-ink-secondary hover:text-ink'
                      }`}
                    >
                      {active && <Check className="w-3 h-3 text-ink shrink-0" />}
                      <span>{opt.label}</span>
                      <span className="text-[10px] text-ink-muted tabular-nums">{opt.example}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs text-ink-secondary hover:text-ink cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-on-accent font-semibold text-xs transition-colors cursor-pointer"
            >
              {saving ? 'Saving…' : 'Save Preferences'}
            </button>
          </div>
        </form>

        {/* Two-Factor Authentication (TOTP) */}
        <div ref={totpSectionRef} className="pt-4 border-t border-tone/[0.08] space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-ink flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-healthy" />
                Two-Factor Authentication (2FA)
              </div>
              <div className="text-[11px] text-ink-muted mt-0.5">
                {totpEnabled
                  ? 'Protected with an authenticator app (TOTP).'
                  : 'Require a 6-digit authenticator code when signing in.'}
              </div>
            </div>
            {!totpEnabled && !totpSetup && (
              <button
                type="button"
                disabled={totpBusy}
                onClick={handleStartTOTP}
                className="px-3 py-1.5 rounded-lg bg-elevated hover:bg-hairline border border-tone/12 text-xs font-medium text-ink transition-colors cursor-pointer shrink-0"
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
                className="px-3 py-1.5 rounded-lg bg-danger/10 hover:bg-danger/20 border border-danger/30 text-xs font-medium text-danger transition-colors cursor-pointer shrink-0"
              >
                Disable 2FA
              </button>
            )}
            {totpEnabled && totpRequired && (
              <span className="px-2.5 py-1 rounded-full bg-healthy/15 text-[10px] font-medium text-healthy shrink-0">
                Required by admin
              </span>
            )}
          </div>

          {totpSetup && (
            <div className="rounded-xl bg-canvas/80 border border-tone/10 p-3.5 space-y-3">
              <div className="text-[11px] text-ink-secondary leading-relaxed">
                Scan this QR code with your authenticator app (1Password, Apple Passwords, Bitwarden,
                Google Authenticator), then confirm with your password and a 6-digit code.
              </div>

              {qrMatrix && (
                <div className="flex flex-col items-center gap-2 py-1">
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
                            <rect
                              key={`${x}-${y}`}
                              x={x}
                              y={y}
                              width={1}
                              height={1}
                              fill="#09090B"
                            />
                          ) : null
                        )
                      )}
                    </svg>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowManualKey((v) => !v)}
                    className="text-[11px] text-ink-secondary hover:text-ink underline underline-offset-2 cursor-pointer"
                  >
                    {showManualKey ? 'Hide manual setup key' : "Can't scan? Enter setup key manually"}
                  </button>
                </div>
              )}

              {showManualKey && (
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-surface border border-hairline px-2.5 py-1.5 text-xs font-mono text-ink break-all select-all">
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
                    {copiedSecret ? <Check className="w-3.5 h-3.5 text-healthy" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="password"
                  value={totpPassword}
                  onChange={(e) => setTotpPassword(e.target.value)}
                  placeholder="Current password"
                  className="rounded-lg bg-surface border border-hairline px-2.5 py-1.5 text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="6-digit code"
                  className="rounded-lg bg-surface border border-hairline px-2.5 py-1.5 text-base sm:text-xs font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTotpSetup(null);
                    setTotpError('');
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-ink-secondary hover:text-ink cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={totpBusy || !totpPassword || totpCode.trim().length < 6}
                  onClick={handleEnableTOTP}
                  className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent font-semibold text-xs cursor-pointer"
                >
                  {totpBusy ? 'Verifying…' : 'Verify & Enable'}
                </button>
              </div>
            </div>
          )}

          {totpDisabling && (
            <div className="rounded-xl bg-canvas/80 border border-danger/25 p-3.5 space-y-2.5">
              <div className="text-[11px] text-ink-secondary">
                Confirm your password and a current authenticator (or recovery) code to disable 2FA.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="password"
                  value={totpPassword}
                  onChange={(e) => setTotpPassword(e.target.value)}
                  placeholder="Current password"
                  className="rounded-lg bg-surface border border-hairline px-2.5 py-1.5 text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
                />
                <input
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="Code or XXXX-XXXX"
                  className="rounded-lg bg-surface border border-hairline px-2.5 py-1.5 text-base sm:text-xs font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTotpDisabling(false);
                    setTotpError('');
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-ink-secondary hover:text-ink cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={totpBusy || !totpPassword || !totpCode.trim()}
                  onClick={handleDisableTOTP}
                  className="px-3 py-1.5 rounded-lg bg-danger text-white font-semibold text-xs disabled:opacity-50 cursor-pointer"
                >
                  {totpBusy ? 'Disabling…' : 'Confirm Disable'}
                </button>
              </div>
            </div>
          )}

          {recoveryCodes && recoveryCodes.length > 0 && (
            <div className="rounded-xl bg-healthy/10 border border-healthy/30 p-3.5 space-y-2">
              <div className="text-xs font-semibold text-healthy">
                2FA Enabled — Save Your One-Time Recovery Codes
              </div>
              <p className="text-[11px] text-ink-secondary">
                Store these codes somewhere safe. Each code can be used once if you lose your
                authenticator device.
              </p>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-xs text-ink">
                {recoveryCodes.map((c) => (
                  <div
                    key={c}
                    className="rounded bg-canvas/80 border border-hairline px-2 py-1 text-center select-all"
                  >
                    {c}
                  </div>
                ))}
              </div>
            </div>
          )}

          {totpError && (
            <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">
              {totpError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
