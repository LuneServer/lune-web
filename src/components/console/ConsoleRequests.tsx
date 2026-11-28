import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  PlugZap,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  api,
  ApiError,
  formatBytes,
  type ArrInstanceConfig,
  type ArrTestResponse,
  type MediaRequest,
  type RequestsConfig,
  type RequestStatus,
} from '../../lib/api';
import { LuneMark } from '../LuneMark';

interface Props {
  onRequestsConfigChange?: (enabled: boolean) => void;
  onPendingCountChange?: (count: number) => void;
}

type SubTab = 'queue' | 'settings';
type StatusFilter = 'all' | RequestStatus;
type ArrSlot = 'radarr' | 'sonarr' | 'radarr_anime' | 'sonarr_anime';

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'processing', label: 'Processing' },
  { id: 'available', label: 'Available' },
  { id: 'declined', label: 'Declined' },
  { id: 'failed', label: 'Failed' },
];

const DEFAULT_ARR: ArrInstanceConfig = {
  enabled: false,
  url: '',
  api_key: '',
  quality_profile_id: 0,
  root_folder: '',
  search_on_add: true,
};

const DEFAULT_CONFIG: RequestsConfig = {
  enabled: false,
  tmdb_configured: true,
  radarr: { ...DEFAULT_ARR, minimum_availability: 'released' },
  radarr_anime: { ...DEFAULT_ARR, minimum_availability: 'released' },
  sonarr: { ...DEFAULT_ARR, series_type: 'standard', season_folder: true },
  sonarr_anime: { ...DEFAULT_ARR, series_type: 'anime', season_folder: true },
};

const SLOT_META: {
  slot: ArrSlot;
  service: 'radarr' | 'sonarr';
  title: string;
  description: string;
  optional?: boolean;
}[] = [
  {
    slot: 'radarr',
    service: 'radarr',
    title: 'Radarr (Movies)',
    description: 'Routes approved movie requests to your primary Radarr instance.',
  },
  {
    slot: 'sonarr',
    service: 'sonarr',
    title: 'Sonarr (TV Shows)',
    description: 'Routes approved TV series requests to your primary Sonarr instance.',
  },
  {
    slot: 'radarr_anime',
    service: 'radarr',
    title: 'Radarr — Anime Films (Optional)',
    description: 'Dedicated Radarr instance for anime films. Falls back to primary Radarr if disabled.',
    optional: true,
  },
  {
    slot: 'sonarr_anime',
    service: 'sonarr',
    title: 'Sonarr — Anime Series (Optional)',
    description: 'Dedicated Sonarr instance for anime series. Falls back to primary Sonarr if disabled.',
    optional: true,
  },
];

function StatusBadge({ status }: { status: RequestStatus }) {
  switch (status) {
    case 'available':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-healthy/15 text-healthy text-[10px] font-medium">
          <CheckCircle2 className="w-3 h-3" />
          Available
        </span>
      );
    case 'approved':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-telemetry/15 text-telemetry text-[10px] font-medium">
          <Check className="w-3 h-3" />
          Approved
        </span>
      );
    case 'processing':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-telemetry/15 text-telemetry text-[10px] font-medium">
          <Loader2 className="w-3 h-3 animate-spin" />
          Processing
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/15 text-warning text-[10px] font-medium">
          <Clock className="w-3 h-3" />
          Pending
        </span>
      );
    case 'declined':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger/15 text-danger text-[10px] font-medium">
          <XCircle className="w-3 h-3" />
          Declined
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger/15 text-danger text-[10px] font-medium">
          <AlertTriangle className="w-3 h-3" />
          Failed
        </span>
      );
  }
}

function normalizeSlot(slot: ArrInstanceConfig): ArrInstanceConfig {
  return {
    ...slot,
    url: slot.url ?? '',
    api_key: slot.api_key ?? '',
    root_folder: slot.root_folder ?? '',
    anime_root_folder: slot.anime_root_folder ?? '',
  };
}

function normalizeConfig(cfg: RequestsConfig): RequestsConfig {
  return {
    ...cfg,
    radarr: normalizeSlot(cfg.radarr),
    radarr_anime: normalizeSlot(cfg.radarr_anime),
    sonarr: normalizeSlot(cfg.sonarr),
    sonarr_anime: normalizeSlot(cfg.sonarr_anime),
  };
}

export function ConsoleRequests({
  onRequestsConfigChange,
  onPendingCountChange,
}: Props) {
  const [subTab, setSubTab] = useState<SubTab>('queue');

  // Queue state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [requests, setRequests] = useState<MediaRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueErr, setQueueErr] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState('');

  // Settings state
  const [config, setConfig] = useState<RequestsConfig>(DEFAULT_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);
  const [configErr, setConfigErr] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');

  // Collapsible state for optional anime cards (expanded automatically if enabled)
  const [expandedSlots, setExpandedSlots] = useState<Record<ArrSlot, boolean>>({
    radarr: true,
    sonarr: true,
    radarr_anime: false,
    sonarr_anime: false,
  });

  // Per-slot test results (profiles, root folders, connection status)
  const [testingSlot, setTestingSlot] = useState<ArrSlot | null>(null);
  const [testResults, setTestResults] = useState<Partial<Record<ArrSlot, ArrTestResponse>>>({});

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueErr('');
    try {
      const res = await api.listRequests({
        scope: 'all',
        status: statusFilter === 'all' ? undefined : statusFilter,
        limit: 200,
      });
      setRequests(res.requests);
      setPendingCount(res.pending_count);
      onPendingCountChange?.(res.pending_count);
    } catch (err) {
      setQueueErr(err instanceof ApiError ? err.message : 'Failed to load request queue');
    } finally {
      setQueueLoading(false);
    }
  }, [statusFilter, onPendingCountChange]);

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigErr('');
    try {
      const rawCfg = await api.adminGetRequestsConfig();
      const cfg = normalizeConfig(rawCfg);
      setConfig(cfg);
      setExpandedSlots((prev) => ({
        ...prev,
        radarr_anime: prev.radarr_anime || cfg.radarr_anime.enabled,
        sonarr_anime: prev.sonarr_anime || cfg.sonarr_anime.enabled,
      }));
      // Automatically fetch quality profile names & root folders for any configured slot
      const slotsToHydrate: { slot: ArrSlot; service: 'radarr' | 'sonarr' }[] = [
        { slot: 'radarr', service: 'radarr' },
        { slot: 'sonarr', service: 'sonarr' },
        { slot: 'radarr_anime', service: 'radarr' },
        { slot: 'sonarr_anime', service: 'sonarr' },
      ];
      for (const { slot, service } of slotsToHydrate) {
        const inst = cfg[slot];
        if (inst.url.trim() && inst.has_api_key) {
          api
            .adminTestArrConnection({ service, slot, url: inst.url.trim(), api_key: '' })
            .then((res) => {
              if (res.ok) {
                setTestResults((prev) => ({ ...prev, [slot]: res }));
              }
            })
            .catch(() => {});
        }
      }
    } catch (err) {
      setConfigErr(err instanceof ApiError ? err.message : 'Failed to load requests configuration');
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  async function handleApproveOrRetry(req: MediaRequest) {
    setBusyId(req.id);
    setQueueErr('');
    try {
      const updated = await api.adminApproveRequest(req.id);
      setRequests((prev) => prev.map((r) => (r.id === req.id ? updated : r)));
      if (req.status === 'pending') {
        const nextPending = Math.max(0, pendingCount - 1);
        setPendingCount(nextPending);
        onPendingCountChange?.(nextPending);
      }
    } catch (err) {
      setQueueErr(err instanceof ApiError ? err.message : 'Failed to approve request');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(req: MediaRequest) {
    setBusyId(req.id);
    setQueueErr('');
    try {
      const updated = await api.adminDeclineRequest(req.id, declineNote.trim() || undefined);
      setRequests((prev) => prev.map((r) => (r.id === req.id ? updated : r)));
      if (req.status === 'pending') {
        const nextPending = Math.max(0, pendingCount - 1);
        setPendingCount(nextPending);
        onPendingCountChange?.(nextPending);
      }
      setDecliningId(null);
      setDeclineNote('');
    } catch (err) {
      setQueueErr(err instanceof ApiError ? err.message : 'Failed to decline request');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(req: MediaRequest) {
    setBusyId(req.id);
    setQueueErr('');
    try {
      await api.deleteRequest(req.id);
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      if (req.status === 'pending') {
        const nextPending = Math.max(0, pendingCount - 1);
        setPendingCount(nextPending);
        onPendingCountChange?.(nextPending);
      }
    } catch (err) {
      setQueueErr(err instanceof ApiError ? err.message : 'Failed to delete request');
    } finally {
      setBusyId(null);
    }
  }

  function updateSlot(slot: ArrSlot, patch: Partial<ArrInstanceConfig>) {
    setSavedNotice('');
    setConfig((prev) => ({
      ...prev,
      [slot]: {
        ...prev[slot],
        ...patch,
      },
    }));
  }

  async function handleTestConnection(slot: ArrSlot, service: 'radarr' | 'sonarr') {
    const inst = config[slot];
    setTestingSlot(slot);
    setConfigErr('');
    try {
      const res = await api.adminTestArrConnection({
        service,
        slot,
        url: (inst.url ?? '').trim(),
        api_key: (inst.api_key ?? '').trim(),
      });
      setTestResults((prev) => ({ ...prev, [slot]: res }));
      if (res.ok) {
        // Automatically enable the instance when the connection test passes,
        // and auto-select first profile / root folder if none currently selected.
        const patch: Partial<ArrInstanceConfig> = { enabled: true };
        if (!inst.quality_profile_id && res.quality_profiles && res.quality_profiles.length > 0) {
          patch.quality_profile_id = res.quality_profiles[0].id;
        }
        if (!inst.root_folder && res.root_folders && res.root_folders.length > 0) {
          patch.root_folder = res.root_folders[0].path;
        }
        updateSlot(slot, patch);
      }
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [slot]: {
          ok: false,
          error: err instanceof ApiError ? err.message : 'Connection test failed',
        },
      }));
    } finally {
      setTestingSlot(null);
    }
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
    setConfigErr('');
    setSavedNotice('');
    try {
      const saved = normalizeConfig(await api.adminSaveRequestsConfig(config));
      setConfig(saved);
      setSavedNotice('Configuration saved.');
      onRequestsConfigChange?.(saved.enabled);
    } catch (err) {
      setConfigErr(err instanceof ApiError ? err.message : 'Failed to save configuration');
    } finally {
      setSavingConfig(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Sub-tab Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Requests management tabs"
          className="inline-flex items-center rounded-lg bg-surface border border-hairline p-0.5 text-xs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'queue'}
            onClick={() => setSubTab('queue')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              subTab === 'queue'
                ? 'bg-tone/12 text-ink'
                : 'text-ink-secondary hover:text-ink'
            }`}
          >
            Queue
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-warning/15 text-warning text-[10px] font-semibold tabular-nums">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'settings'}
            onClick={() => setSubTab('settings')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              subTab === 'settings'
                ? 'bg-tone/12 text-ink'
                : 'text-ink-secondary hover:text-ink'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            Settings &amp; Integrations
          </button>
        </div>

        {!configLoading && (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
              config.enabled
                ? 'bg-healthy/15 text-healthy'
                : 'bg-elevated text-ink-muted'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                config.enabled ? 'bg-healthy' : 'bg-ink-muted'
              }`}
            />
            {config.enabled ? 'Requests Enabled' : 'Requests Disabled'}
          </span>
        )}
      </div>

      {/* QUEUE TAB */}
      {subTab === 'queue' && (
        <div className="space-y-4">
          {/* Status filter pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border ${
                    active
                      ? 'bg-tone/12 text-ink border-tone/25'
                      : 'bg-surface border-hairline text-ink-secondary hover:text-ink'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {queueErr && (
            <div className="rounded-lg bg-danger/10 border border-danger/30 px-3.5 py-2.5 text-xs text-danger">
              {queueErr}
            </div>
          )}

          {queueLoading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-xs text-ink-secondary">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading requests…
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-xl bg-surface border border-tone/[0.08] p-10 text-center space-y-1">
              <div className="text-sm font-medium text-ink">No matching requests</div>
              <p className="text-xs text-ink-secondary">
                {statusFilter === 'all'
                  ? 'User media requests will appear here once submitted.'
                  : `There are currently no ${statusFilter} requests.`}
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-surface border border-tone/[0.08] divide-y divide-tone/[0.08]">
              {requests.map((req) => {
                const isBusy = busyId === req.id;
                const isDeclining = decliningId === req.id;

                return (
                  <div key={req.id} className="p-4 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 shrink-0 aspect-[2/3] rounded-md overflow-hidden bg-elevated border border-tone/[0.08] flex items-center justify-center">
                          {req.poster_url ? (
                            <img
                              src={req.poster_url}
                              alt={req.title}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <LuneMark alt="" className="w-4 h-4 opacity-30" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-ink truncate">
                              {req.title}
                            </span>
                            {req.year && (
                              <span className="text-xs tabular-nums text-ink-muted">{req.year}</span>
                            )}
                            <span className="px-2 py-0.5 rounded-full bg-elevated text-[10px] font-medium text-ink-secondary">
                              {req.is_anime ? 'Anime' : req.media_type === 'movie' ? 'Movie' : 'Series'}
                            </span>
                            <StatusBadge status={req.status} />
                          </div>

                          <div className="text-[11px] text-ink-secondary mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums">
                            <span>
                              by <span className="text-ink">{req.display_name || req.username}</span>{' '}
                              <span className="text-ink-muted">(@{req.username})</span>
                            </span>
                            <span className="text-ink-muted">
                              {new Date(req.created_at).toLocaleString()}
                            </span>
                            {req.external_service && (
                              <span className="text-ink-muted font-mono text-[10px]">
                                {req.external_service}
                                {req.external_id ? ` #${req.external_id}` : ''}
                              </span>
                            )}
                          </div>

                          {req.status_note && (
                            <p className="text-xs text-ink-secondary mt-1.5 bg-canvas/70 border border-tone/[0.06] rounded-md px-2.5 py-1.5">
                              {req.status_note}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                        {req.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleApproveOrRetry(req)}
                              className="inline-flex items-center gap-1 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent font-semibold text-xs px-2.5 py-1.5 transition-colors cursor-pointer"
                            >
                              {isBusy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setDecliningId(isDeclining ? null : req.id);
                                setDeclineNote('');
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-canvas border border-hairline hover:border-danger/50 text-xs text-ink-secondary hover:text-danger px-2.5 py-1.5 transition-colors cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              Decline
                            </button>
                          </>
                        )}

                        {(req.status === 'failed' ||
                          (req.status === 'approved' && !req.external_id)) && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleApproveOrRetry(req)}
                            className="inline-flex items-center gap-1 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent font-semibold text-xs px-2.5 py-1.5 transition-colors cursor-pointer"
                          >
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                            {req.status === 'failed'
                              ? 'Retry'
                              : req.media_type === 'movie'
                                ? 'Send to Radarr'
                                : 'Send to Sonarr'}
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isBusy}
                          title="Delete request"
                          onClick={() => handleDelete(req)}
                          className="p-1.5 rounded-lg text-ink-secondary hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {isDeclining && (
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-tone/[0.06]">
                        <input
                          type="text"
                          value={declineNote}
                          onChange={(e) => setDeclineNote(e.target.value)}
                          placeholder="Optional decline note shown to the requester…"
                          className="flex-1 min-w-[200px] rounded-lg bg-canvas border border-hairline px-3 py-1.5 text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/40"
                        />
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDecline(req)}
                          className="rounded-lg bg-danger hover:bg-danger/90 text-white font-semibold text-xs px-3 py-1.5 cursor-pointer disabled:opacity-50"
                        >
                          Confirm Decline
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDecliningId(null);
                            setDeclineNote('');
                          }}
                          className="rounded-lg bg-elevated text-xs text-ink-secondary hover:text-ink px-3 py-1.5 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SETTINGS & INTEGRATIONS TAB */}
      {subTab === 'settings' && (
        <div className="space-y-5">
          {configLoading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-xs text-ink-secondary">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading configuration…
            </div>
          ) : (
            <>
              {/* Master Toggle Card */}
              <div className="rounded-xl bg-surface border border-tone/[0.08] p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-ink">Enable Media Requests</h2>
                    <p className="text-xs text-ink-secondary mt-0.5">
                      Allow permitted users to browse TMDB and request movies, TV shows, and anime from the top navigation bar.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={(e) => {
                        setSavedNotice('');
                        setConfig((prev) => ({ ...prev, enabled: e.target.checked }));
                      }}
                      className="w-4 h-4 accent-accent cursor-pointer"
                    />
                    <span className="text-xs font-medium text-ink">
                      {config.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                </div>

                {config.tmdb_configured === false && (
                  <div className="rounded-lg bg-warning/10 border border-warning/30 px-3.5 py-2.5 text-xs text-warning flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      TMDB is not configured on this server. Set{' '}
                      <span className="font-mono">LUNE_TMDB_API_KEY</span> or{' '}
                      <span className="font-mono">LUNE_TMDB_BASE_URL</span> to enable title discovery and requests.
                    </div>
                  </div>
                )}
              </div>

              {/* Arr Integration Cards */}
              {SLOT_META.map(({ slot, service, title, description, optional }) => {
                const inst = config[slot];
                const isExpanded = expandedSlots[slot];
                const testRes = testResults[slot];
                const isTesting = testingSlot === slot;
                const profiles = testRes?.quality_profiles ?? [];
                const folders = testRes?.root_folders ?? [];

                return (
                  <div
                    key={slot}
                    className="rounded-xl bg-surface border border-tone/[0.08] overflow-hidden"
                  >
                    <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSlots((prev) => ({ ...prev, [slot]: !prev[slot] }))
                        }
                        className="flex items-center gap-2.5 text-left min-w-0 cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-ink-muted shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-ink">{title}</span>
                            {inst.enabled && (
                              <span className="px-2 py-0.5 rounded-full bg-healthy/15 text-healthy text-[10px] font-medium">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-ink-secondary mt-0.5">{description}</p>
                        </div>
                      </button>

                      <label className="inline-flex items-center gap-2 text-xs text-ink cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={inst.enabled}
                          onChange={(e) => {
                            const next = e.target.checked;
                            updateSlot(slot, { enabled: next });
                            if (next) {
                              setExpandedSlots((prev) => ({ ...prev, [slot]: true }));
                            }
                          }}
                          className="accent-accent cursor-pointer"
                        />
                        {optional ? 'Use dedicated instance' : 'Enable'}
                      </label>
                    </div>

                    {isExpanded && (
                      <div className="px-5 pb-5 pt-2 border-t border-tone/[0.06] space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                              Server URL
                            </label>
                            <input
                              type="url"
                              value={inst.url}
                              onChange={(e) => updateSlot(slot, { url: e.target.value })}
                              placeholder={
                                service === 'radarr'
                                  ? 'http://radarr:7878'
                                  : 'http://sonarr:8989'
                              }
                              className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                              API Key
                            </label>
                            <input
                              type="password"
                              value={inst.api_key}
                              onChange={(e) => updateSlot(slot, { api_key: e.target.value })}
                              placeholder={
                                inst.has_api_key
                                  ? 'Saved (leave blank to keep)'
                                  : 'Paste API key'
                              }
                              className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
                            />
                          </div>
                        </div>

                        {/* Test Connection + Result */}
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            disabled={isTesting || !inst.url.trim()}
                            onClick={() => handleTestConnection(slot, service)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-canvas hover:bg-elevated border border-hairline disabled:opacity-50 text-xs font-medium text-ink px-3 py-1.5 transition-colors cursor-pointer"
                          >
                            {isTesting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <PlugZap className="w-3.5 h-3.5" />
                            )}
                            Test &amp; Load Profiles
                          </button>

                          {testRes && (
                            <span
                              className={`text-xs flex items-center gap-1.5 ${
                                testRes.ok ? 'text-healthy' : 'text-danger'
                              }`}
                            >
                              {testRes.ok ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  Connected to {testRes.app_name || service}{' '}
                                  {testRes.version ?? ''}
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                                  {testRes.error || 'Connection failed'}
                                </>
                              )}
                            </span>
                          )}
                        </div>

                        {/* Quality Profile & Root Folder */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                              Quality Profile
                            </label>
                            {profiles.length > 0 ? (
                              <select
                                value={inst.quality_profile_id}
                                onChange={(e) =>
                                  updateSlot(slot, { quality_profile_id: Number(e.target.value) })
                                }
                                className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs text-ink focus:outline-none focus:border-tone/50"
                              >
                                <option value={0}>Select a quality profile…</option>
                                {profiles.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                value={inst.quality_profile_id || ''}
                                onChange={(e) =>
                                  updateSlot(slot, {
                                    quality_profile_id: Number(e.target.value) || 0,
                                  })
                                }
                                placeholder="Click Test & Load Profiles or enter ID"
                                className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs tabular-nums text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
                              />
                            )}
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                              Root Folder
                            </label>
                            {folders.length > 0 ? (
                              <select
                                value={inst.root_folder}
                                onChange={(e) => updateSlot(slot, { root_folder: e.target.value })}
                                className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs font-mono text-ink focus:outline-none focus:border-tone/50"
                              >
                                <option value="">Select a root folder…</option>
                                {folders.map((f) => (
                                  <option key={f.path} value={f.path}>
                                    {f.path}
                                    {f.free_space ? ` (${formatBytes(f.free_space)} free)` : ''}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={inst.root_folder}
                                onChange={(e) => updateSlot(slot, { root_folder: e.target.value })}
                                placeholder={
                                  service === 'radarr' ? '/movies' : '/tv'
                                }
                                className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
                              />
                            )}
                          </div>
                        </div>

                        {/* Anime Quality Profile & Root Folder overrides on main Sonarr/Radarr when no dedicated Anime instance is enabled */}
                        {((slot === 'sonarr' && !config.sonarr_anime.enabled) ||
                          (slot === 'radarr' && !config.radarr_anime.enabled)) && (
                          <div className="pt-3 border-t border-tone/[0.06] space-y-2.5">
                            <div>
                              <div className="text-[11px] font-medium text-ink">
                                Anime Overrides <span className="text-ink-muted font-normal">(Optional)</span>
                              </div>
                              <p className="text-[11px] text-ink-muted">
                                {slot === 'sonarr'
                                  ? 'Use a separate quality profile or root folder for anime requests in this Sonarr instance (automatically sets series type to Anime).'
                                  : 'Use a separate quality profile or root folder for anime film requests in this Radarr instance.'}
                              </p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                              <div>
                                <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                                  Anime Quality Profile
                                </label>
                                {profiles.length > 0 ? (
                                  <select
                                    value={inst.anime_quality_profile_id ?? 0}
                                    onChange={(e) =>
                                      updateSlot(slot, {
                                        anime_quality_profile_id: Number(e.target.value) || 0,
                                      })
                                    }
                                    className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs text-ink focus:outline-none focus:border-tone/50"
                                  >
                                    <option value={0}>Same as default quality profile</option>
                                    {profiles.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="number"
                                    min={0}
                                    value={inst.anime_quality_profile_id || ''}
                                    onChange={(e) =>
                                      updateSlot(slot, {
                                        anime_quality_profile_id: Number(e.target.value) || 0,
                                      })
                                    }
                                    placeholder="Same as default (or enter ID)"
                                    className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs tabular-nums text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
                                  />
                                )}
                              </div>

                              <div>
                                <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                                  Anime Root Folder
                                </label>
                                {folders.length > 0 ? (
                                  <select
                                    value={inst.anime_root_folder ?? ''}
                                    onChange={(e) =>
                                      updateSlot(slot, { anime_root_folder: e.target.value })
                                    }
                                    className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs font-mono text-ink focus:outline-none focus:border-tone/50"
                                  >
                                    <option value="">Same as default root folder</option>
                                    {folders.map((f) => (
                                      <option key={f.path} value={f.path}>
                                        {f.path}
                                        {f.free_space ? ` (${formatBytes(f.free_space)} free)` : ''}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    value={inst.anime_root_folder ?? ''}
                                    onChange={(e) =>
                                      updateSlot(slot, { anime_root_folder: e.target.value })
                                    }
                                    placeholder="Same as default (e.g. /anime)"
                                    className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Service-specific options + Search on Add */}
                        <div className="flex flex-wrap items-center gap-4 pt-1">
                          {service === 'radarr' ? (
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-ink-secondary">
                                Minimum Availability
                              </label>
                              <select
                                value={inst.minimum_availability || 'released'}
                                onChange={(e) =>
                                  updateSlot(slot, { minimum_availability: e.target.value })
                                }
                                className="rounded-lg bg-canvas border border-hairline px-2.5 py-1.5 text-base sm:text-xs text-ink focus:outline-none focus:border-tone/50"
                              >
                                <option value="announced">Announced</option>
                                <option value="inCinemas">In Cinemas</option>
                                <option value="released">Released</option>
                              </select>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-ink-secondary">Series Type</label>
                                <select
                                  value={inst.series_type || (slot === 'sonarr_anime' ? 'anime' : 'standard')}
                                  onChange={(e) =>
                                    updateSlot(slot, { series_type: e.target.value })
                                  }
                                  className="rounded-lg bg-canvas border border-hairline px-2.5 py-1.5 text-base sm:text-xs text-ink focus:outline-none focus:border-tone/50"
                                >
                                  <option value="standard">Standard</option>
                                  <option value="anime">Anime</option>
                                  <option value="daily">Daily</option>
                                </select>
                              </div>

                              <label className="inline-flex items-center gap-2 text-xs text-ink cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={inst.season_folder ?? true}
                                  onChange={(e) =>
                                    updateSlot(slot, { season_folder: e.target.checked })
                                  }
                                  className="accent-accent cursor-pointer"
                                />
                                Season folders
                              </label>
                            </>
                          )}

                          <label className="inline-flex items-center gap-2 text-xs text-ink cursor-pointer">
                            <input
                              type="checkbox"
                              checked={inst.search_on_add}
                              onChange={(e) =>
                                updateSlot(slot, { search_on_add: e.target.checked })
                              }
                              className="accent-accent cursor-pointer"
                            />
                            Search on add
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {configErr && (
                <div className="rounded-lg bg-danger/10 border border-danger/30 px-3.5 py-2.5 text-xs text-danger">
                  {configErr}
                </div>
              )}

              {savedNotice && (
                <div className="rounded-lg bg-healthy/10 border border-healthy/30 px-3.5 py-2.5 text-xs text-healthy flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {savedNotice}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={savingConfig}
                  onClick={handleSaveConfig}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent font-semibold text-xs px-4 py-2 transition-colors cursor-pointer"
                >
                  {savingConfig ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Save Configuration
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
