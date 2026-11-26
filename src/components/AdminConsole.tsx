import { useCallback, useEffect, useState } from 'react';
import {
  FolderOpen,
  Globe,
  Inbox,
  LayoutDashboard,
  Link2,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Users,
  Wrench,
} from 'lucide-react';
import {
  api,
  type ActiveStream,
  type AdminUser,
  type AuditEvent,
  type HealthStatus,
  type Invite,
  type Library,
  type NetworkConfig,
} from '../lib/api';
import { ConsoleOverview } from './console/ConsoleOverview';
import { ConsoleLibraries } from './console/ConsoleLibraries';
import { ConsoleUsers } from './console/ConsoleUsers';
import { ConsoleInvites } from './console/ConsoleInvites';
import { ConsoleActivity } from './console/ConsoleActivity';
import { ConsoleRequests } from './console/ConsoleRequests';
import { ConsolePlayback } from './console/ConsolePlayback';
import { ConsoleNetwork } from './console/ConsoleNetwork';
import { ConsoleMaintenance } from './console/ConsoleMaintenance';
import { buildConsoleAlerts } from './console/auditUtils';
import { AppLink, consolePath } from './AppLink';

const DISMISSED_ALERTS_STORAGE_KEY = 'lune_dismissed_alerts';

function loadLocalDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISSED_ALERTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveLocalDismissed(ids: Set<string>) {
  try {
    const arr = Array.from(ids).slice(-500);
    window.localStorage.setItem(DISMISSED_ALERTS_STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // ignore storage errors
  }
}

export type ConsoleSection =
  | 'overview'
  | 'libraries'
  | 'requests'
  | 'users'
  | 'invites'
  | 'playback'
  | 'network'
  | 'maintenance'
  | 'activity';

interface Props {
  section: ConsoleSection;
  onSectionChange: (section: ConsoleSection) => void;
  currentUserId: string;
  libraries: Library[];
  publicUrl?: string;
  onLibrariesChanged: () => void;
  onRequestsConfigChange?: (enabled: boolean) => void;
  onNetworkConfigChange?: (cfg: NetworkConfig) => void;
}

const SECTION_META: Record<ConsoleSection, { title: string; subtitle: string }> = {
  overview: {
    title: 'Overview',
    subtitle: 'Live server health, catalog metrics, active playbacks, and alerts.',
  },
  libraries: {
    title: 'Libraries',
    subtitle: 'Configure mounted media directories, trigger scans, and refresh metadata.',
  },
  requests: {
    title: 'Requests',
    subtitle: 'Review user title requests and configure Radarr and Sonarr integrations.',
  },
  users: {
    title: 'Users',
    subtitle: 'Manage accounts, roles, library permissions, and active sessions.',
  },
  invites: {
    title: 'Invites',
    subtitle: 'Generate and revoke time-limited onboarding links for new accounts.',
  },
  playback: {
    title: 'Playback',
    subtitle: 'Configure concurrent transcoding limits and idle session cleanup.',
  },
  network: {
    title: 'Network',
    subtitle: 'Configure access mode, built-in HTTPS, reverse proxy, or Tailscale.',
  },
  maintenance: {
    title: 'Maintenance',
    subtitle: 'Configure periodic housekeeping, retention windows, and run cleanup passes.',
  },
  activity: {
    title: 'Activity & Security',
    subtitle: 'Full audit trail of sign-ins, security alerts, and administrative actions.',
  },
};

export function AdminConsole({
  section,
  onSectionChange,
  currentUserId,
  libraries,
  publicUrl,
  onLibrariesChanged,
  onRequestsConfigChange,
  onNetworkConfigChange,
}: Props) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [streams, setStreams] = useState<ActiveStream[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set(loadLocalDismissed()));
  const [refreshing, setRefreshing] = useState(false);
  const [stoppingStreamId, setStoppingStreamId] = useState('');

  const refreshTelemetry = useCallback(async () => {
    setRefreshing(true);
    try {
      const [h, s, a, u, inv, dis, reqs] = await Promise.all([
        api.getHealth().catch(() => null),
        api.listActiveStreams().catch(() => ({ streams: [] })),
        api.listAuditEvents(100).catch(() => ({ events: [] })),
        api.listUsers().catch(() => ({ users: [] })),
        api.listInvites().catch(() => ({ invites: [] })),
        api.getDismissedAlerts().catch(() => null),
        api.listRequests({ scope: 'all', status: 'pending', limit: 1 }).catch(() => null),
      ]);
      setHealth(h);
      setStreams(s.streams);
      setEvents(a.events);
      setUsers(u.users);
      setInvites(inv.invites);
      if (reqs) {
        setPendingRequestsCount(reqs.pending_count);
      }
      if (dis?.dismissed_ids) {
        setDismissedIds((prev) => {
          const next = new Set(prev);
          for (const id of dis.dismissed_ids) next.add(id);
          saveLocalDismissed(next);
          return next;
        });
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshTelemetry();
  }, [refreshTelemetry]);

  // Keep live stats, active playbacks, and alerts fresh on Overview.
  useEffect(() => {
    if (section !== 'overview') return;
    const timer = window.setInterval(() => {
      refreshTelemetry();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [section, refreshTelemetry]);

  async function handleStopStream(sessionId: string) {
    setStoppingStreamId(sessionId);
    try {
      await api.stopPlaybackSession(sessionId);
      await refreshTelemetry();
    } finally {
      setStoppingStreamId('');
    }
  }

  function handleDismissAlerts(ids: string[]) {
    if (ids.length === 0) return;
    setDismissedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      saveLocalDismissed(next);
      return next;
    });
    api.dismissAlerts(ids).catch(() => {});
  }

  const activeInvitesCount = invites.filter((i) => i.status === 'active').length;
  const alerts = buildConsoleAlerts({ health, libraries, events, dismissedIds });
  const alertCount = alerts.length;

  const navItems: {
    id: ConsoleSection;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: string;
    badgeTone?: 'default' | 'warn';
  }[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: LayoutDashboard,
      badge: streams.length > 0 ? `${streams.length} live` : undefined,
    },
    {
      id: 'libraries',
      label: 'Libraries',
      icon: FolderOpen,
      badge: String(libraries.length),
    },
    {
      id: 'requests',
      label: 'Requests',
      icon: Inbox,
      badge: pendingRequestsCount > 0 ? String(pendingRequestsCount) : undefined,
      badgeTone: pendingRequestsCount > 0 ? 'warn' : 'default',
    },
    {
      id: 'users',
      label: 'Users',
      icon: Users,
      badge: String(users.length),
    },
    {
      id: 'invites',
      label: 'Invites',
      icon: Link2,
      badge: activeInvitesCount > 0 ? String(activeInvitesCount) : undefined,
    },
    {
      id: 'playback',
      label: 'Playback',
      icon: SlidersHorizontal,
    },
    {
      id: 'network',
      label: 'Network',
      icon: Globe,
    },
    {
      id: 'maintenance',
      label: 'Maintenance',
      icon: Wrench,
    },
    {
      id: 'activity',
      label: 'Activity & Security',
      icon: ShieldAlert,
      badge: alertCount > 0 ? String(alertCount) : undefined,
      badgeTone: alertCount > 0 ? 'warn' : 'default',
    },
  ];

  const meta = SECTION_META[section];

  return (
    <div className="space-y-6">
      {/* Console Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-tone/[0.08]">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-secondary">
            Admin Console
          </div>
          <h1 className="text-xl font-semibold text-ink tracking-tight mt-0.5">
            {meta.title}
          </h1>
          <p className="text-xs text-ink-secondary mt-0.5">{meta.subtitle}</p>
        </div>

        <button
          type="button"
          disabled={refreshing}
          onClick={() => {
            onLibrariesChanged();
            refreshTelemetry();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-surface hover:bg-elevated border border-hairline text-xs font-medium text-ink px-3 py-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Category Sidebar + Active Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside className="lg:col-span-3 min-w-0">
          <nav
            aria-label="Console categories"
            className="flex lg:flex-col gap-1 overflow-x-auto no-scrollbar rounded-xl bg-surface/80 backdrop-blur-md border border-tone/[0.08] p-1.5"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = section === item.id;
              return (
                <AppLink
                  key={item.id}
                  href={consolePath(item.id)}
                  onNavigate={() => onSectionChange(item.id)}
                  className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-elevated text-ink'
                      : 'text-ink-secondary hover:text-ink hover:bg-canvas/50'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-ink' : 'text-ink-muted'
                      }`}
                    />
                    {item.label}
                  </span>
                  {item.badge && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium tabular-nums ${
                        item.badgeTone === 'warn'
                          ? 'bg-warning/15 text-warning'
                          : isActive
                            ? 'bg-tone/12 text-ink'
                            : 'bg-canvas/80 text-ink-muted'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </AppLink>
              );
            })}
          </nav>
        </aside>

        <div className="lg:col-span-9 min-w-0">
          {section === 'overview' && (
            <ConsoleOverview
              health={health}
              libraries={libraries}
              streams={streams}
              events={events}
              users={users}
              invites={invites}
              alerts={alerts}
              stoppingStreamId={stoppingStreamId}
              onStopStream={handleStopStream}
              onDismissAlerts={handleDismissAlerts}
              onNavigate={onSectionChange}
            />
          )}

          {section === 'libraries' && (
            <ConsoleLibraries
              libraries={libraries}
              onLibrariesChanged={onLibrariesChanged}
              onRefreshTelemetry={refreshTelemetry}
            />
          )}

          {section === 'requests' && (
            <ConsoleRequests
              onRequestsConfigChange={onRequestsConfigChange}
              onPendingCountChange={setPendingRequestsCount}
            />
          )}

          {section === 'users' && (
            <ConsoleUsers
              currentUserId={currentUserId}
              users={users}
              libraries={libraries}
              onChanged={refreshTelemetry}
            />
          )}

          {section === 'invites' && (
            <ConsoleInvites
              invites={invites}
              libraries={libraries}
              publicUrl={publicUrl}
              onChanged={refreshTelemetry}
            />
          )}

          {section === 'playback' && <ConsolePlayback />}

          {section === 'network' && (
            <ConsoleNetwork
              onNetworkConfigChange={(cfg) => {
                onNetworkConfigChange?.(cfg);
                refreshTelemetry();
              }}
            />
          )}

          {section === 'maintenance' && <ConsoleMaintenance />}

          {section === 'activity' && <ConsoleActivity events={events} />}

          <footer className="mt-8 pt-5 border-t border-tone/[0.08] text-center">
            <p className="max-w-2xl mx-auto text-[11px] leading-relaxed text-ink-muted">
              Metadata and artwork may be provided by TMDB. Lune uses the TMDB API but is not endorsed or certified by TMDB.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
