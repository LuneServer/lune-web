import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Play,
  Save,
} from 'lucide-react';
import {
  api,
  ApiError,
  formatBytes,
  type MaintenanceConfig,
  type MaintenanceStatus,
} from '../../lib/api';

const DEFAULT_CONFIG: MaintenanceConfig = {
  enabled: true,
  interval_hours: 24,
  schedule_time: '03:00',
  cleanup_orphaned_artwork: true,
  artwork_grace_hours: 24,
  cleanup_transcode_cache: true,
  subtitle_cache_days: 30,
  prune_audit_logs: true,
  audit_retention_days: 90,
  optimize_database: true,
};

const INTERVAL_PRESETS: { label: string; hours: number }[] = [
  { label: '12h', hours: 12 },
  { label: 'Daily', hours: 24 },
  { label: '3 Days', hours: 72 },
  { label: 'Weekly', hours: 168 },
];

function formatTimestamp(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function TogglePill({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
        checked
          ? 'bg-accent border-accent'
          : 'bg-canvas border-hairline hover:border-tone/30'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
          checked ? 'translate-x-[18px] bg-on-accent' : 'translate-x-0.5 bg-ink-muted'
        }`}
      />
    </button>
  );
}

export function ConsoleMaintenance() {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [cfg, setCfg] = useState<MaintenanceConfig>(DEFAULT_CONFIG);

  const [intervalInput, setIntervalInput] = useState('24');
  const [useFixedTime, setUseFixedTime] = useState(true);
  const [scheduleTimeInput, setScheduleTimeInput] = useState('03:00');
  const [graceInput, setGraceInput] = useState('24');
  const [subDaysInput, setSubDaysInput] = useState('30');
  const [auditDaysInput, setAuditDaysInput] = useState('90');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [err, setErr] = useState('');
  const [feedback, setFeedback] = useState('');

  function hydrate(next: MaintenanceStatus) {
    setStatus(next);
    const c = next.config ?? DEFAULT_CONFIG;
    setCfg(c);
    setIntervalInput(String(c.interval_hours));
    if (c.schedule_time && c.schedule_time.trim() !== '') {
      setUseFixedTime(true);
      setScheduleTimeInput(c.schedule_time.trim());
    } else {
      setUseFixedTime(false);
    }
    setGraceInput(String(c.artwork_grace_hours));
    setSubDaysInput(String(c.subtitle_cache_days));
    setAuditDaysInput(String(c.audit_retention_days));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    api
      .adminGetMaintenance()
      .then((res) => {
        if (!cancelled) hydrate(res);
      })
      .catch((error) => {
        if (!cancelled) {
          setErr(error instanceof ApiError ? error.message : 'Failed to load maintenance settings');
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
    if (feedback) setFeedback('');
    if (err) setErr('');
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setFeedback('');

    const intervalHours = Number.parseInt(intervalInput.trim(), 10);
    if (!Number.isFinite(intervalHours) || intervalHours < 1 || intervalHours > 720) {
      setErr('Schedule interval must be between 1 and 720 hours.');
      return;
    }
    const graceHours = Number.parseInt(graceInput.trim(), 10);
    if (!Number.isFinite(graceHours) || graceHours < 1 || graceHours > 168) {
      setErr('Artwork grace period must be between 1 and 168 hours.');
      return;
    }
    const subDays = Number.parseInt(subDaysInput.trim(), 10);
    if (!Number.isFinite(subDays) || subDays < 1 || subDays > 365) {
      setErr('Extracted subtitle cache retention must be between 1 and 365 days.');
      return;
    }
    const auditDays = Number.parseInt(auditDaysInput.trim(), 10);
    if (!Number.isFinite(auditDays) || auditDays < 7 || auditDays > 3650) {
      setErr('Audit log retention must be between 7 and 3650 days.');
      return;
    }

    const trimmedTime = useFixedTime ? scheduleTimeInput.trim() : '';
    if (useFixedTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmedTime)) {
      setErr('Preferred run time must be in 24-hour HH:MM format (e.g. 03:00).');
      return;
    }

    setSaving(true);
    try {
      const payload: MaintenanceConfig = {
        ...cfg,
        interval_hours: intervalHours,
        schedule_time: trimmedTime,
        artwork_grace_hours: graceHours,
        subtitle_cache_days: subDays,
        audit_retention_days: auditDays,
      };
      const updated = await api.adminSaveMaintenanceConfig(payload);
      hydrate(updated);
      setFeedback('Maintenance settings saved and rescheduled live.');
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Failed to save maintenance settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    setErr('');
    setFeedback('');
    setRunningNow(true);
    try {
      const updated = await api.adminRunMaintenance();
      hydrate(updated);
      setFeedback('Housekeeping pass completed.');
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Failed to run maintenance');
    } finally {
      setRunningNow(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl bg-surface border border-tone/[0.08] p-8 flex items-center justify-center gap-2 text-xs text-ink-secondary">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading maintenance settings…
      </div>
    );
  }

  const lastRun = status?.last_run;

  return (
    <div className="space-y-6">
      {/* Status & Manual Run Card */}
      <div className="rounded-xl bg-surface border border-tone/[0.08] p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Housekeeping Status</h2>
            <p className="text-xs text-ink-secondary mt-0.5">
              Lightweight background maintenance keeps cached artwork, transcode leftovers, audit
              logs, and SQLite tidy without interrupting playback.
            </p>
          </div>

          <button
            type="button"
            disabled={runningNow || status?.running}
            onClick={handleRunNow}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent text-xs font-semibold px-3.5 py-2 transition-colors cursor-pointer shrink-0"
          >
            {runningNow || status?.running ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            {runningNow || status?.running ? 'Running…' : 'Run Maintenance Now'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg bg-canvas/70 border border-tone/[0.06] px-3.5 py-2.5">
            <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
              Schedule
            </div>
            <div className="mt-1 text-xs font-semibold text-ink tabular-nums">
              {status?.config.enabled
                ? status.config.schedule_time
                  ? `Every ${status.config.interval_hours}h at ${status.config.schedule_time}`
                  : `Every ${status.config.interval_hours}h`
                : 'Paused'}
            </div>
          </div>

          <div className="rounded-lg bg-canvas/70 border border-tone/[0.06] px-3.5 py-2.5">
            <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
              Next Scheduled Run
            </div>
            <div className="mt-1 text-xs font-semibold text-ink tabular-nums flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-ink-muted shrink-0" />
              {status?.config.enabled ? formatTimestamp(status.next_run_at) : 'Disabled'}
            </div>
          </div>

          <div className="rounded-lg bg-canvas/70 border border-tone/[0.06] px-3.5 py-2.5">
            <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
              Last Run
            </div>
            <div className="mt-1 text-xs font-semibold text-ink tabular-nums">
              {lastRun
                ? `${formatTimestamp(lastRun.finished_at)} (${lastRun.duration_ms}ms)`
                : 'Never run'}
            </div>
          </div>
        </div>

        {lastRun && (
          <div className="rounded-lg bg-canvas/50 border border-tone/[0.06] p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-secondary">
              <span className="font-medium text-ink">
                Last Pass Summary ({lastRun.trigger === 'manual' ? 'Manual' : 'Scheduled'})
              </span>
              {lastRun.skipped_artwork_scan_busy && (
                <span className="text-warning">
                  Artwork sweep skipped (library scan in progress)
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs tabular-nums">
              <div>
                <span className="text-ink-muted block text-[10px]">Orphaned Artwork</span>
                <span className="text-ink font-medium">
                  {lastRun.artwork_files_removed} files
                  {lastRun.artwork_bytes_freed > 0
                    ? ` (${formatBytes(lastRun.artwork_bytes_freed)})`
                    : ''}
                </span>
              </div>
              <div>
                <span className="text-ink-muted block text-[10px]">Transcode & Sub Cache</span>
                <span className="text-ink font-medium">
                  {lastRun.transcode_items_removed} items
                  {lastRun.transcode_bytes_freed > 0
                    ? ` (${formatBytes(lastRun.transcode_bytes_freed)})`
                    : ''}
                </span>
              </div>
              <div>
                <span className="text-ink-muted block text-[10px]">Audit Events Pruned</span>
                <span className="text-ink font-medium">{lastRun.audit_events_pruned}</span>
              </div>
              <div>
                <span className="text-ink-muted block text-[10px]">SQLite Optimize</span>
                <span className="text-ink font-medium">
                  {lastRun.database_optimized ? 'Completed' : 'Skipped'}
                </span>
              </div>
            </div>
            {lastRun.errors && lastRun.errors.length > 0 && (
              <div className="pt-1.5 border-t border-tone/[0.06] flex items-start gap-1.5 text-[11px] text-warning">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{lastRun.errors.join(' · ')}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Customizable Schedule & Task Rules */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="rounded-xl bg-surface border border-tone/[0.08] p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-ink">Schedule &amp; Tasks</h2>
            <p className="text-xs text-ink-secondary mt-0.5">
              Enable or disable individual housekeeping tasks and customize retention windows.
            </p>
          </div>

          <div className="divide-y divide-tone/[0.08]">
            {/* Master Automatic Schedule */}
            <div className="py-4 first:pt-1 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1 max-w-lg">
                <div className="text-xs font-medium text-ink">Automatic Housekeeping</div>
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  Run enabled tasks automatically in the background. You can always trigger a pass
                  manually even when the schedule is paused.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <TogglePill
                  checked={cfg.enabled}
                  onChange={(enabled) => {
                    setCfg((prev) => ({ ...prev, enabled }));
                    clearFeedback();
                  }}
                  label="Toggle automatic housekeeping"
                />
              </div>
            </div>

            {/* Interval */}
            <div className="py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1 max-w-lg">
                <label
                  htmlFor="lune-maint-interval"
                  className="block text-xs font-medium text-ink"
                >
                  Run Frequency (Hours)
                </label>
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  How often automatic housekeeping runs (1–720 hours). Default: 24 hours (daily).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="inline-flex items-center rounded-lg bg-canvas border border-hairline p-0.5">
                  {INTERVAL_PRESETS.map((p) => {
                    const active = Number.parseInt(intervalInput, 10) === p.hours;
                    return (
                      <button
                        key={p.hours}
                        type="button"
                        onClick={() => {
                          setIntervalInput(String(p.hours));
                          clearFeedback();
                        }}
                        className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                          active ? 'bg-elevated text-ink' : 'text-ink-secondary hover:text-ink'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  id="lune-maint-interval"
                  type="number"
                  min={1}
                  max={720}
                  step={1}
                  inputMode="numeric"
                  disabled={!cfg.enabled}
                  value={intervalInput}
                  onChange={(e) => {
                    setIntervalInput(e.target.value);
                    clearFeedback();
                  }}
                  className="w-20 rounded-lg bg-canvas border border-hairline px-2.5 py-1.5 text-xs tabular-nums text-ink disabled:opacity-50 focus:outline-none focus:border-tone/50"
                />
                <span className="text-xs text-ink-muted">hrs</span>
              </div>
            </div>

            {/* Preferred Run Time */}
            <div className="py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1 max-w-lg">
                <label
                  htmlFor="lune-maint-time"
                  className="block text-xs font-medium text-ink"
                >
                  Preferred Run Time
                </label>
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  Pin automatic housekeeping to an off-peak local time so it doesn&apos;t drift with
                  container restarts
                  {status?.server_timezone ? ` (server time: ${status.server_timezone})` : ''}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div
                  role="group"
                  aria-label="Maintenance time mode"
                  className="inline-flex items-center rounded-lg bg-canvas border border-hairline p-0.5"
                >
                  <button
                    type="button"
                    disabled={!cfg.enabled}
                    aria-pressed={useFixedTime}
                    onClick={() => {
                      setUseFixedTime(true);
                      if (!scheduleTimeInput) setScheduleTimeInput('03:00');
                      clearFeedback();
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                      useFixedTime ? 'bg-elevated text-ink' : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    Fixed Time
                  </button>
                  <button
                    type="button"
                    disabled={!cfg.enabled}
                    aria-pressed={!useFixedTime}
                    onClick={() => {
                      setUseFixedTime(false);
                      clearFeedback();
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                      !useFixedTime ? 'bg-elevated text-ink' : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    Rolling
                  </button>
                </div>

                {useFixedTime && (
                  <input
                    id="lune-maint-time"
                    type="time"
                    disabled={!cfg.enabled}
                    value={scheduleTimeInput}
                    onChange={(e) => {
                      setScheduleTimeInput(e.target.value);
                      clearFeedback();
                    }}
                    className="rounded-lg bg-canvas border border-hairline px-2.5 py-1.5 text-xs tabular-nums text-ink disabled:opacity-50 focus:outline-none focus:border-tone/50"
                  />
                )}
              </div>
            </div>

            {/* Orphaned Artwork Cleanup */}
            <div className="py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1 max-w-lg">
                <label
                  htmlFor="lune-maint-artwork-grace"
                  className="block text-xs font-medium text-ink"
                >
                  Orphaned Artwork Cleanup
                </label>
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  Removes cached posters, backdrops, and cast portraits no longer referenced by any
                  library item. Skips automatically if a library scan is running or if a file is
                  newer than the grace window.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {cfg.cleanup_orphaned_artwork && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-ink-muted">Grace</span>
                    <input
                      id="lune-maint-artwork-grace"
                      type="number"
                      min={1}
                      max={168}
                      step={1}
                      inputMode="numeric"
                      value={graceInput}
                      onChange={(e) => {
                        setGraceInput(e.target.value);
                        clearFeedback();
                      }}
                      className="w-16 rounded-lg bg-canvas border border-hairline px-2 py-1.5 text-xs tabular-nums text-ink focus:outline-none focus:border-tone/50"
                    />
                    <span className="text-xs text-ink-muted">hrs</span>
                  </div>
                )}
                <TogglePill
                  checked={cfg.cleanup_orphaned_artwork}
                  onChange={(v) => {
                    setCfg((prev) => ({ ...prev, cleanup_orphaned_artwork: v }));
                    clearFeedback();
                  }}
                  label="Toggle orphaned artwork cleanup"
                />
              </div>
            </div>

            {/* Transcode & Subtitle Cache Cleanup */}
            <div className="py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1 max-w-lg">
                <label
                  htmlFor="lune-maint-sub-days"
                  className="block text-xs font-medium text-ink"
                >
                  Transcode &amp; Subtitle Cache Cleanup
                </label>
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  Removes abandoned transcode folders (never touching active streams) and extracted
                  embedded `.vtt` subtitle caches older than the retention window.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {cfg.cleanup_transcode_cache && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-ink-muted">Sub cache</span>
                    <input
                      id="lune-maint-sub-days"
                      type="number"
                      min={1}
                      max={365}
                      step={1}
                      inputMode="numeric"
                      value={subDaysInput}
                      onChange={(e) => {
                        setSubDaysInput(e.target.value);
                        clearFeedback();
                      }}
                      className="w-16 rounded-lg bg-canvas border border-hairline px-2 py-1.5 text-xs tabular-nums text-ink focus:outline-none focus:border-tone/50"
                    />
                    <span className="text-xs text-ink-muted">days</span>
                  </div>
                )}
                <TogglePill
                  checked={cfg.cleanup_transcode_cache}
                  onChange={(v) => {
                    setCfg((prev) => ({ ...prev, cleanup_transcode_cache: v }));
                    clearFeedback();
                  }}
                  label="Toggle transcode and subtitle cache cleanup"
                />
              </div>
            </div>

            {/* Audit Log Retention */}
            <div className="py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1 max-w-lg">
                <label
                  htmlFor="lune-maint-audit-days"
                  className="block text-xs font-medium text-ink"
                >
                  Audit Log Retention
                </label>
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  Prunes security and activity audit events older than the retention window (7–3650
                  days) to keep the database compact.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {cfg.prune_audit_logs && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-ink-muted">Keep</span>
                    <input
                      id="lune-maint-audit-days"
                      type="number"
                      min={7}
                      max={3650}
                      step={1}
                      inputMode="numeric"
                      value={auditDaysInput}
                      onChange={(e) => {
                        setAuditDaysInput(e.target.value);
                        clearFeedback();
                      }}
                      className="w-20 rounded-lg bg-canvas border border-hairline px-2 py-1.5 text-xs tabular-nums text-ink focus:outline-none focus:border-tone/50"
                    />
                    <span className="text-xs text-ink-muted">days</span>
                  </div>
                )}
                <TogglePill
                  checked={cfg.prune_audit_logs}
                  onChange={(v) => {
                    setCfg((prev) => ({ ...prev, prune_audit_logs: v }));
                    clearFeedback();
                  }}
                  label="Toggle audit log retention"
                />
              </div>
            </div>

            {/* SQLite Optimization */}
            <div className="py-4 last:pb-1 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1 max-w-lg">
                <div className="text-xs font-medium text-ink">SQLite Optimization</div>
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  Runs non-blocking query planner statistics updates (<code>PRAGMA optimize</code>)
                  and a passive WAL checkpoint without locking active readers or writers.
                </p>
              </div>

              <div className="flex items-center shrink-0">
                <TogglePill
                  checked={cfg.optimize_database}
                  onChange={(v) => {
                    setCfg((prev) => ({ ...prev, optimize_database: v }));
                    clearFeedback();
                  }}
                  label="Toggle SQLite optimization"
                />
              </div>
            </div>
          </div>

          {err && (
            <div className="rounded-lg bg-danger/10 border border-danger/25 px-3.5 py-2.5 text-xs text-danger">
              {err}
            </div>
          )}

          {feedback && (
            <div className="rounded-lg bg-healthy/10 border border-healthy/25 px-3.5 py-2.5 text-xs text-healthy flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-tone/[0.08]">
            <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Changes take effect immediately without restarting the server.
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent text-xs font-semibold px-4 py-2 transition-colors cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save Settings
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
