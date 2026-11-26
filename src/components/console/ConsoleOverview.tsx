import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Film,
  FolderOpen,
  HardDrive,
  Music,
  Radio,
  Shield,
  Sparkles,
  Square,
  Tv,
  Users,
  X,
} from 'lucide-react';
import {
  formatUptime,
  type ActiveStream,
  type AdminUser,
  type AuditEvent,
  type HealthStatus,
  type Invite,
  type Library,
} from '../../lib/api';
import type { ConsoleSection } from '../AdminConsole';
import { getEventMeta, type ConsoleAlert } from './auditUtils';

interface Props {
  health: HealthStatus | null;
  libraries: Library[];
  streams: ActiveStream[];
  events: AuditEvent[];
  users: AdminUser[];
  invites: Invite[];
  alerts: ConsoleAlert[];
  stoppingStreamId: string;
  onStopStream: (sessionId: string) => void;
  onDismissAlerts: (ids: string[]) => void;
  onNavigate: (section: ConsoleSection) => void;
}

export function ConsoleOverview({
  health,
  libraries,
  streams,
  events,
  users,
  invites,
  alerts,
  stoppingStreamId,
  onStopStream,
  onDismissAlerts,
  onNavigate,
}: Props) {
  const totalItems = libraries.reduce((sum, l) => sum + l.item_count, 0);
  const scanningLibs = libraries.filter((l) => l.scan?.running);
  const activeSessions = users.reduce((sum, u) => sum + (u.active_sessions ?? 0), 0);
  const activeInvites = invites.filter((i) => i.status === 'active').length;

  const byKind = libraries.reduce(
    (acc, lib) => {
      acc[lib.kind] = (acc[lib.kind] ?? 0) + lib.item_count;
      return acc;
    },
    {} as Record<Library['kind'], number>,
  );

  const visibleAlerts = alerts.slice(0, 6);
  const recentEvents = events.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Server & Library Stats Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl bg-surface border border-tone/[0.08] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-ink-secondary mb-2">
            <span>Server &amp; Edge</span>
            <Activity
              className={`w-3.5 h-3.5 ${health?.status === 'ok' ? 'text-healthy' : 'text-danger'}`}
            />
          </div>
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-lg font-semibold text-ink">
                {health ? (health.status === 'ok' ? 'Healthy' : 'Degraded') : '…'}
              </span>
              {health && (
                <span className="text-[11px] font-medium tabular-nums text-healthy">
                  up {formatUptime(health.uptime_seconds)}
                </span>
              )}
            </div>
            <div className="text-xs tabular-nums text-telemetry mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {health ? (
                <>
                  <span>edge: {health.edge_mode}</span>
                  <span className="text-ink-muted">·</span>
                  <span
                    className={`inline-flex items-center gap-1 ${
                      health.database_ok ? '' : 'text-danger'
                    }`}
                  >
                    <Database className="w-3 h-3 shrink-0" />
                    {health.database_ok ? 'SQLite WAL' : 'Database offline'}
                  </span>
                  <span className="text-ink-muted">·</span>
                  <span className="text-ink">v{health.version}</span>
                </>
              ) : (
                <span>Checking node…</span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('libraries')}
          className="text-left rounded-xl bg-surface hover:bg-elevated border border-tone/[0.08] hover:border-accent/40 p-4 flex flex-col justify-between transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-ink-secondary mb-2">
            <span>Catalog &amp; Libraries</span>
            <HardDrive className="w-3.5 h-3.5 text-ink" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold text-ink">{totalItems.toLocaleString()}</span>
              <span className="text-xs text-ink-secondary">
                items in {libraries.length} {libraries.length === 1 ? 'library' : 'libraries'}
              </span>
            </div>
            <div className="text-xs tabular-nums text-ink-secondary mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
              {scanningLibs.length > 0 ? (
                <span className="text-telemetry">Scanning {scanningLibs[0].name}…</span>
              ) : (
                <>
                  {byKind.movies !== undefined && (
                    <span className="inline-flex items-center gap-1">
                      <Film className="w-3 h-3 text-ink" /> {byKind.movies}
                    </span>
                  )}
                  {byKind.shows !== undefined && (
                    <span className="inline-flex items-center gap-1">
                      <Tv className="w-3 h-3 text-telemetry" /> {byKind.shows}
                    </span>
                  )}
                  {byKind.anime !== undefined && (
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-warning" /> {byKind.anime}
                    </span>
                  )}
                  {byKind.music !== undefined && (
                    <span className="inline-flex items-center gap-1">
                      <Music className="w-3 h-3 text-healthy" /> {byKind.music}
                    </span>
                  )}
                  {byKind.other !== undefined && (
                    <span className="inline-flex items-center gap-1">
                      <FolderOpen className="w-3 h-3 text-ink-secondary" /> {byKind.other}
                    </span>
                  )}
                  {libraries.length === 0 && <span className="text-ink-muted">No libraries yet</span>}
                </>
              )}
            </div>
          </div>
        </button>

        <div className="rounded-xl bg-surface border border-tone/[0.08] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-ink-secondary mb-2">
            <span>Active Playbacks</span>
            <Radio
              className={`w-3.5 h-3.5 ${streams.length > 0 ? 'text-healthy animate-pulse' : 'text-telemetry'}`}
            />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold text-ink">{streams.length}</span>
              <span className="text-xs text-ink-secondary">{streams.length === 1 ? 'stream' : 'streams'}</span>
            </div>
            <div className="text-xs tabular-nums text-ink-secondary mt-1.5">
              {streams.length > 0
                ? `${streams.filter((s) => s.mode === 'direct').length} direct · ${streams.filter((s) => s.mode !== 'direct').length} transcoded`
                : 'Idle · ready for Direct Play'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('users')}
          className="text-left rounded-xl bg-surface hover:bg-elevated border border-tone/[0.08] hover:border-accent/40 p-4 flex flex-col justify-between transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-ink-secondary mb-2">
            <span>Accounts &amp; Sessions</span>
            <Users className="w-3.5 h-3.5 text-ink" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold text-ink">{users.length}</span>
              <span className="text-xs text-ink-secondary">{users.length === 1 ? 'user' : 'users'}</span>
            </div>
            <div className="text-xs tabular-nums text-ink-secondary mt-1.5">
              {activeSessions} active {activeSessions === 1 ? 'session' : 'sessions'}
              {activeInvites > 0 ? ` · ${activeInvites} open ${activeInvites === 1 ? 'invite' : 'invites'}` : ''}
            </div>
          </div>
        </button>
      </section>

      {/* Alerts */}
      <section className="rounded-xl bg-surface border border-tone/[0.08] p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            {alerts.length > 0 ? (
              <AlertTriangle className="w-4 h-4 text-warning" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-healthy" />
            )}
            <h2 className="text-sm font-semibold text-ink">System Alerts</h2>
          </div>
          <div className="flex items-center gap-2.5">
            {alerts.length > 0 && (
              <button
                type="button"
                onClick={() => onDismissAlerts(alerts.map((a) => a.id))}
                className="text-xs font-medium text-ink-secondary hover:text-ink transition-colors cursor-pointer"
              >
                Clear all
              </button>
            )}
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ${
                alerts.length > 0
                  ? 'bg-warning/15 text-warning'
                  : 'bg-healthy/15 text-healthy'
              }`}
            >
              {alerts.length > 0 ? `${alerts.length} active` : 'All clear'}
            </span>
          </div>
        </div>

        {alerts.length === 0 ? (
          <p className="text-xs text-ink-secondary">
            All services, library scanners, and security monitors are operating normally.
          </p>
        ) : (
          <div className="space-y-2">
            {visibleAlerts.map((al) => (
              <div
                key={al.id}
                className={`rounded-lg border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 ${
                  al.severity === 'error'
                    ? 'bg-danger/8 border-danger/25'
                    : 'bg-warning/8 border-warning/25'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-xs font-medium ${
                      al.severity === 'error' ? 'text-danger' : 'text-warning'
                    }`}
                  >
                    {al.title}
                  </div>
                  <div className="text-xs text-ink-secondary mt-0.5 truncate">{al.detail}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {al.actionSection && al.actionLabel && (
                    <button
                      type="button"
                      onClick={() => onNavigate(al.actionSection!)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-ink hover:text-ink cursor-pointer"
                    >
                      {al.actionLabel}
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Dismiss alert"
                    aria-label="Dismiss alert"
                    onClick={() => onDismissAlerts([al.id])}
                    className="p-1 rounded-md text-ink-secondary hover:text-ink hover:bg-canvas/60 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {alerts.length > visibleAlerts.length && (
              <div className="text-[11px] text-ink-secondary pt-1 flex items-center justify-between">
                <span>+{alerts.length - visibleAlerts.length} more alert(s)</span>
                <button
                  type="button"
                  onClick={() => onNavigate('activity')}
                  className="text-ink hover:text-ink cursor-pointer"
                >
                  Inspect all in Activity
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Active Playbacks */}
      <section className="rounded-xl bg-surface border border-tone/[0.08] p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-telemetry" />
            <h2 className="text-sm font-semibold text-ink">Active Playbacks</h2>
          </div>
          <span className="text-[11px] tabular-nums text-ink-muted">Auto-refreshes every 15s</span>
        </div>

        {streams.length === 0 ? (
          <div className="rounded-lg bg-canvas/60 border border-tone/[0.06] px-4 py-6 text-center text-xs text-ink-secondary">
            No active streams right now. Active Direct Play, remux, and transcoded sessions will appear here.
          </div>
        ) : (
          <div className="divide-y divide-tone/[0.08]">
            {streams.map((st) => {
              const modeBadge =
                st.mode === 'direct'
                  ? 'bg-healthy/15 text-healthy'
                  : st.mode === 'remux'
                    ? 'bg-telemetry/15 text-telemetry'
                    : 'bg-warning/15 text-warning';
              return (
                <div key={st.session_id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-ink truncate">{st.item_title}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ${modeBadge}`}>
                        {st.mode}
                      </span>
                    </div>
                    <div className="text-xs tabular-nums text-ink-secondary mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span className="text-ink">@{st.username}</span>
                      <span>{st.client_name}</span>
                      <span className="text-ink-muted">{st.client_ip || 'local'}</span>
                      <span className="text-ink-muted">
                        started {new Date(st.started_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={stoppingStreamId === st.session_id}
                    onClick={() => onStopStream(st.session_id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-canvas border border-hairline hover:border-danger/60 hover:text-danger text-xs font-medium text-ink-secondary px-3 py-1.5 transition-colors cursor-pointer"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    Stop
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Activity Log */}
      <section className="rounded-xl bg-surface border border-tone/[0.08] p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-ink" />
            <h2 className="text-sm font-semibold text-ink">Recent Activity</h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('activity')}
            className="inline-flex items-center gap-1 text-xs font-medium text-ink hover:text-ink cursor-pointer"
          >
            Full activity log
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentEvents.length === 0 ? (
          <p className="text-xs text-ink-muted py-4">No activity recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead>
                <tr className="border-b border-tone/[0.08] text-ink-muted">
                  <th className="py-2 pr-4 font-medium whitespace-nowrap">Event</th>
                  <th className="py-2 pr-4 font-medium whitespace-nowrap">Detail</th>
                  <th className="py-2 pr-4 font-medium whitespace-nowrap">Client IP</th>
                  <th className="py-2 font-medium text-right whitespace-nowrap">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tone/[0.06] text-ink-secondary">
                {recentEvents.map((ev) => {
                  const meta = getEventMeta(ev.event_type);
                  return (
                    <tr key={ev.id}>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${meta.badgeClass}`}>
                          {ev.event_type}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-ink">{ev.detail}</td>
                      <td className="py-2 pr-4 whitespace-nowrap font-mono">{ev.client_ip || 'local'}</td>
                      <td className="py-2 text-right text-ink-muted whitespace-nowrap">
                        {new Date(ev.created_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
