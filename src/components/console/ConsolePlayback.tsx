import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Info, Loader2, Save } from 'lucide-react';
import { api, ApiError, type StreamingConfig } from '../../lib/api';

const DEFAULT_CONFIG: StreamingConfig = {
  max_global_transcodes: 0,
  max_user_transcodes: 3,
  idle_timeout_minutes: 10,
};

function normalizeStreamingConfig(raw?: Partial<StreamingConfig> | null): StreamingConfig {
  const maxGlobal =
    typeof raw?.max_global_transcodes === 'number' && Number.isFinite(raw.max_global_transcodes)
      ? Math.max(0, Math.trunc(raw.max_global_transcodes))
      : DEFAULT_CONFIG.max_global_transcodes;
  const maxUser =
    typeof raw?.max_user_transcodes === 'number' && Number.isFinite(raw.max_user_transcodes)
      ? Math.max(0, Math.trunc(raw.max_user_transcodes))
      : DEFAULT_CONFIG.max_user_transcodes;
  const idleMinutes =
    typeof raw?.idle_timeout_minutes === 'number' && Number.isFinite(raw.idle_timeout_minutes)
      ? Math.min(120, Math.max(1, Math.trunc(raw.idle_timeout_minutes)))
      : DEFAULT_CONFIG.idle_timeout_minutes;

  return {
    max_global_transcodes: maxGlobal,
    max_user_transcodes: maxUser,
    idle_timeout_minutes: idleMinutes,
  };
}

export function ConsolePlayback() {
  const [globalUnlimited, setGlobalUnlimited] = useState(true);
  const [globalLimitInput, setGlobalLimitInput] = useState('4');

  const [userUnlimited, setUserUnlimited] = useState(false);
  const [userLimitInput, setUserLimitInput] = useState('3');

  const [idleTimeoutInput, setIdleTimeoutInput] = useState('10');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [savedLive, setSavedLive] = useState(false);

  function applyConfigToForm(cfg: StreamingConfig) {
    if (cfg.max_global_transcodes <= 0) {
      setGlobalUnlimited(true);
    } else {
      setGlobalUnlimited(false);
      setGlobalLimitInput(String(cfg.max_global_transcodes));
    }

    if (cfg.max_user_transcodes <= 0) {
      setUserUnlimited(true);
    } else {
      setUserUnlimited(false);
      setUserLimitInput(String(cfg.max_user_transcodes));
    }

    setIdleTimeoutInput(String(cfg.idle_timeout_minutes));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    api
      .adminGetStreamingConfig()
      .then((res) => {
        if (!cancelled) {
          applyConfigToForm(normalizeStreamingConfig(res));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErr(error instanceof ApiError ? error.message : 'Failed to load playback settings');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function clearFeedback() {
    if (savedLive) setSavedLive(false);
    if (err) setErr('');
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setSavedLive(false);

    let maxGlobal = 0;
    if (!globalUnlimited) {
      const parsed = Number.parseInt(globalLimitInput.trim(), 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        setErr('Server-wide concurrent transcodes must be at least 1, or switch to Unlimited.');
        return;
      }
      maxGlobal = parsed;
    }

    let maxUser = 0;
    if (!userUnlimited) {
      const parsed = Number.parseInt(userLimitInput.trim(), 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        setErr('Per-user concurrent transcodes must be at least 1, or switch to Unlimited.');
        return;
      }
      maxUser = parsed;
    }

    const idleMinutes = Number.parseInt(idleTimeoutInput.trim(), 10);
    if (!Number.isFinite(idleMinutes) || idleMinutes < 1 || idleMinutes > 120) {
      setErr('Idle transcode timeout must be between 1 and 120 minutes.');
      return;
    }

    setSaving(true);
    try {
      const payload: StreamingConfig = {
        max_global_transcodes: maxGlobal,
        max_user_transcodes: maxUser,
        idle_timeout_minutes: idleMinutes,
      };
      const saved = normalizeStreamingConfig(await api.adminSaveStreamingConfig(payload));
      applyConfigToForm(saved);
      setSavedLive(true);
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Failed to save playback settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl bg-surface border border-tone/[0.08] p-8 flex items-center justify-center gap-2 text-xs text-ink-secondary">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading playback settings…
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Transcoding Limits Card */}
      <div className="rounded-xl bg-surface border border-tone/[0.08] p-5 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-ink">Transcoding Limits</h2>
          <p className="text-xs text-ink-secondary mt-0.5">
            Control concurrent FFmpeg transcode sessions and idle cleanup. Direct Play streams are
            unaffected.
          </p>
        </div>

        <div className="divide-y divide-tone/[0.08]">
          {/* Server-Wide Concurrent Transcodes */}
          <div className="py-4 first:pt-1 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1 max-w-lg">
              <label
                htmlFor="lune-playback-global-limit"
                className="block text-xs font-medium text-ink"
              >
                Server-Wide Concurrent Transcodes
              </label>
              <p className="text-[11px] leading-relaxed text-ink-muted">
                Default: Unlimited (0). Set a cap to protect server CPU/GPU under heavy multi-user
                load.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <div
                role="group"
                aria-label="Server-wide transcode limit mode"
                className="inline-flex items-center rounded-lg bg-canvas border border-hairline p-0.5"
              >
                <button
                  type="button"
                  aria-pressed={globalUnlimited}
                  onClick={() => {
                    setGlobalUnlimited(true);
                    clearFeedback();
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    globalUnlimited
                      ? 'bg-elevated text-ink'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  Unlimited
                </button>
                <button
                  type="button"
                  aria-pressed={!globalUnlimited}
                  onClick={() => {
                    setGlobalUnlimited(false);
                    if (!globalLimitInput || Number.parseInt(globalLimitInput, 10) < 1) {
                      setGlobalLimitInput('4');
                    }
                    clearFeedback();
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    !globalUnlimited
                      ? 'bg-elevated text-ink'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  Limit
                </button>
              </div>

              {!globalUnlimited && (
                <input
                  id="lune-playback-global-limit"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={globalLimitInput}
                  onChange={(e) => {
                    setGlobalLimitInput(e.target.value);
                    clearFeedback();
                  }}
                  aria-label="Maximum server-wide concurrent transcodes"
                  className="w-20 rounded-lg bg-canvas border border-hairline px-2.5 py-1.5 text-xs tabular-nums text-ink focus:outline-none focus:border-tone/50"
                />
              )}
            </div>
          </div>

          {/* Per-User Concurrent Transcodes */}
          <div className="py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1 max-w-lg">
              <label
                htmlFor="lune-playback-user-limit"
                className="block text-xs font-medium text-ink"
              >
                Per-User Concurrent Transcodes
              </label>
              <p className="text-[11px] leading-relaxed text-ink-muted">
                Limits how many simultaneous transcodes a single account can run at once.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <div
                role="group"
                aria-label="Per-user transcode limit mode"
                className="inline-flex items-center rounded-lg bg-canvas border border-hairline p-0.5"
              >
                <button
                  type="button"
                  aria-pressed={userUnlimited}
                  onClick={() => {
                    setUserUnlimited(true);
                    clearFeedback();
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    userUnlimited
                      ? 'bg-elevated text-ink'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  Unlimited
                </button>
                <button
                  type="button"
                  aria-pressed={!userUnlimited}
                  onClick={() => {
                    setUserUnlimited(false);
                    if (!userLimitInput || Number.parseInt(userLimitInput, 10) < 1) {
                      setUserLimitInput('3');
                    }
                    clearFeedback();
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    !userUnlimited
                      ? 'bg-elevated text-ink'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  Limit
                </button>
              </div>

              {!userUnlimited && (
                <input
                  id="lune-playback-user-limit"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={userLimitInput}
                  onChange={(e) => {
                    setUserLimitInput(e.target.value);
                    clearFeedback();
                  }}
                  aria-label="Maximum per-user concurrent transcodes"
                  className="w-20 rounded-lg bg-canvas border border-hairline px-2.5 py-1.5 text-xs tabular-nums text-ink focus:outline-none focus:border-tone/50"
                />
              )}
            </div>
          </div>

          {/* Idle Transcode Timeout */}
          <div className="py-4 last:pb-1 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1 max-w-lg">
              <label
                htmlFor="lune-playback-idle-timeout"
                className="block text-xs font-medium text-ink"
              >
                Idle Transcode Timeout (minutes)
              </label>
              <p className="text-[11px] leading-relaxed text-ink-muted">
                Automatically stops abandoned transcode sessions and frees scratch disk space after
                this many minutes of inactivity.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input
                id="lune-playback-idle-timeout"
                type="number"
                min={1}
                max={120}
                step={1}
                required
                inputMode="numeric"
                value={idleTimeoutInput}
                onChange={(e) => {
                  setIdleTimeoutInput(e.target.value);
                  clearFeedback();
                }}
                className="w-20 rounded-lg bg-canvas border border-hairline px-2.5 py-1.5 text-xs tabular-nums text-ink focus:outline-none focus:border-tone/50"
              />
              <span className="text-xs text-ink-muted tabular-nums">min</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-canvas/70 border border-tone/[0.08] px-3.5 py-2.5 text-xs text-ink-secondary flex items-start gap-2.5">
          <Info className="w-4 h-4 text-telemetry shrink-0 mt-0.5" />
          <span>
            Changes apply immediately to new transcode sessions. Active streams continue uninterrupted
            and can be managed from <strong className="text-ink">Overview</strong>.
          </span>
        </div>
      </div>

      {/* Feedback Banners */}
      {err && (
        <div className="rounded-lg bg-danger/10 border border-danger/30 px-3.5 py-2.5 text-xs text-danger">
          {err}
        </div>
      )}

      {savedLive && (
        <div className="rounded-lg bg-healthy/10 border border-healthy/30 px-3.5 py-2.5 text-xs text-healthy flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Settings saved and applied live — no restart required.
        </div>
      )}

      {/* Save Action */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent font-semibold text-xs px-4 py-2 transition-colors cursor-pointer"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Playback Settings
        </button>
      </div>
    </form>
  );
}
