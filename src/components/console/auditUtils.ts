import type { AuditEvent, HealthStatus, Library } from '../../lib/api';

export interface EventMeta {
  label: string;
  category: 'auth' | 'admin' | 'user' | 'alert';
  badgeClass: string;
}

export interface ConsoleAlert {
  id: string;
  severity: 'error' | 'warn';
  title: string;
  detail: string;
  actionLabel?: string;
  actionSection?: 'libraries' | 'activity';
}

export function isAlertEvent(ev: AuditEvent): boolean {
  return (
    ev.event_type === 'auth.failed' ||
    ev.event_type === 'auth.rate_limited' ||
    ev.event_type === 'auth.disabled'
  );
}

export function buildConsoleAlerts(params: {
  health: HealthStatus | null;
  libraries: Library[];
  events: AuditEvent[];
  dismissedIds: Set<string>;
}): ConsoleAlert[] {
  const { health, libraries, events, dismissedIds } = params;
  const alerts: ConsoleAlert[] = [];

  if (health && (health.status !== 'ok' || !health.database_ok)) {
    const id = `server-degraded:${health.status}:${health.database_ok ? 'dbok' : 'dberr'}`;
    if (!dismissedIds.has(id)) {
      alerts.push({
        id,
        severity: 'error',
        title: 'Server health degraded',
        detail: health.database_ok
          ? `Edge status reported "${health.status}".`
          : 'SQLite database health check is failing.',
      });
    }
  }

  for (const lib of libraries) {
    if (lib.scan && (lib.scan.errors > 0 || lib.scan.last_error)) {
      const stamp = lib.scan.finished_at || lib.scan.last_error || String(lib.scan.errors);
      const id = `scan-err:${lib.id}:${stamp}`;
      if (!dismissedIds.has(id)) {
        alerts.push({
          id,
          severity: 'warn',
          title: `Scan errors in ${lib.name}`,
          detail:
            lib.scan.last_error ||
            `${lib.scan.errors} file(s) failed to probe or index during the last scan.`,
          actionLabel: 'Inspect libraries',
          actionSection: 'libraries',
        });
      }
    }
  }

  for (const ev of events) {
    if (!isAlertEvent(ev)) continue;
    const id = `audit-${ev.id}`;
    if (dismissedIds.has(id)) continue;
    alerts.push({
      id,
      severity: ev.event_type === 'auth.rate_limited' ? 'error' : 'warn',
      title: getEventMeta(ev.event_type).label,
      detail: `${ev.detail || ev.event_type}${ev.client_ip ? ` · ${ev.client_ip}` : ''}`,
      actionLabel: 'View activity',
      actionSection: 'activity',
    });
  }

  return alerts;
}

export function getEventMeta(eventType: string): EventMeta {
  switch (eventType) {
    case 'auth.rate_limited':
      return {
        label: 'Rate-limited login blocked',
        category: 'alert',
        badgeClass: 'bg-danger/15 text-danger',
      };
    case 'auth.failed':
      return {
        label: 'Failed sign-in attempt',
        category: 'alert',
        badgeClass: 'bg-warning/15 text-warning',
      };
    case 'auth.disabled':
      return {
        label: 'Disabled account blocked',
        category: 'alert',
        badgeClass: 'bg-danger/15 text-danger',
      };
    case 'auth.login':
    case 'auth.device_login':
    case 'auth.device_approved':
    case 'auth.invite_accepted':
    case 'setup.completed':
      return {
        label: eventType,
        category: 'auth',
        badgeClass: 'bg-healthy/15 text-healthy',
      };
    default:
      if (eventType.startsWith('admin.')) {
        return {
          label: eventType,
          category: 'admin',
          badgeClass: 'bg-tone/12 text-ink',
        };
      }
      if (eventType.startsWith('user.')) {
        return {
          label: eventType,
          category: 'user',
          badgeClass: 'bg-telemetry/15 text-telemetry',
        };
      }
      return {
        label: eventType,
        category: 'auth',
        badgeClass: 'bg-elevated text-ink',
      };
  }
}
