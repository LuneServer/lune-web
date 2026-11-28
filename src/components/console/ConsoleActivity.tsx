import { useState } from 'react';
import { Search } from 'lucide-react';
import type { AuditEvent } from '../../lib/api';
import { getEventMeta, isAlertEvent } from './auditUtils';

interface Props {
  events: AuditEvent[];
}

type FilterKind = 'all' | 'alerts' | 'auth' | 'admin' | 'user';

export function ConsoleActivity({ events }: Props) {
  const [filter, setFilter] = useState<FilterKind>('all');
  const [query, setQuery] = useState('');

  const alertCount = events.filter(isAlertEvent).length;
  const authCount = events.filter(
    (ev) => ev.event_type.startsWith('auth.') || ev.event_type.startsWith('setup.'),
  ).length;
  const adminCount = events.filter((ev) => ev.event_type.startsWith('admin.')).length;
  const userCount = events.filter((ev) => ev.event_type.startsWith('user.')).length;

  const filtered = events.filter((ev) => {
    if (filter === 'alerts' && !isAlertEvent(ev)) return false;
    if (filter === 'auth' && !ev.event_type.startsWith('auth.') && !ev.event_type.startsWith('setup.'))
      return false;
    if (filter === 'admin' && !ev.event_type.startsWith('admin.')) return false;
    if (filter === 'user' && !ev.event_type.startsWith('user.')) return false;

    const q = query.trim().toLowerCase();
    if (q) {
      const hay = `${ev.event_type} ${ev.detail} ${ev.client_ip}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const tabs: { id: FilterKind; label: string }[] = [
    { id: 'all', label: `All (${events.length})` },
    { id: 'alerts', label: `Alerts (${alertCount})` },
    { id: 'auth', label: `Auth (${authCount})` },
    { id: 'admin', label: `Admin (${adminCount})` },
    { id: 'user', label: `User (${userCount})` },
  ];

  return (
    <div className="rounded-xl bg-surface border border-tone/[0.08] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Activity &amp; Security Log</h2>
          <p className="text-xs text-ink-secondary mt-0.5">
            Authentication events, administrative changes, invitations, and security lockouts.
          </p>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter events or IP…"
            className="w-52 rounded-lg bg-canvas border border-hairline pl-8 pr-3 py-1.5 text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              filter === tab.id
                ? 'bg-elevated text-ink'
                : 'text-ink-secondary hover:text-ink hover:bg-canvas/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-ink-muted py-6 text-center">No matching activity events.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead>
              <tr className="border-b border-tone/[0.08] text-ink-muted">
                <th className="py-2 pr-4 font-medium whitespace-nowrap">Event</th>
                <th className="py-2 pr-4 font-medium whitespace-nowrap">Client IP</th>
                <th className="py-2 pr-4 font-medium whitespace-nowrap">Detail</th>
                <th className="py-2 font-medium text-right whitespace-nowrap">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tone/[0.06] text-ink-secondary">
              {filtered.map((ev) => {
                const meta = getEventMeta(ev.event_type);
                return (
                  <tr key={ev.id}>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] ${meta.badgeClass}`}>
                        {ev.event_type}
                      </span>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap font-mono">{ev.client_ip || 'local'}</td>
                    <td className="py-2 pr-4 text-ink">{ev.detail}</td>
                    <td className="py-2 text-right text-ink-muted whitespace-nowrap">
                      {new Date(ev.created_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
