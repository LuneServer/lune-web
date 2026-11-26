import { useState, type FormEvent } from 'react';
import { Check, Copy, Link2, Trash2 } from 'lucide-react';
import { api, ApiError, type Invite, type Library } from '../../lib/api';

interface Props {
  invites: Invite[];
  libraries: Library[];
  publicUrl?: string;
  onChanged: () => void;
}

export function ConsoleInvites({ invites, libraries, publicUrl, onChanged }: Props) {
  const [label, setLabel] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [maxUses, setMaxUses] = useState(1);
  const [expiresHours, setExpiresHours] = useState(72);
  const [allLibs, setAllLibs] = useState(true);
  const [libIds, setLibIds] = useState<string[]>([]);
  const [requireTOTP, setRequireTOTP] = useState(false);
  const [err, setErr] = useState('');

  const [createdLink, setCreatedLink] = useState('');
  const [copied, setCopied] = useState(false);

  function toggleLib(id: string) {
    setLibIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      const res = await api.createInvite({
        label: label || undefined,
        role,
        all_libraries: role === 'admin' ? true : allLibs,
        library_ids: role === 'admin' || allLibs ? undefined : libIds,
        require_totp: requireTOTP,
        max_uses: maxUses,
        expires_in_hours: expiresHours,
      });
      const baseOrigin = (publicUrl?.trim() || window.location.origin).replace(/\/+$/, '');
      const invitePath = res.invite_path || `/invite/${res.token}`;
      setCreatedLink(`${baseOrigin}${invitePath.startsWith('/') ? invitePath : `/${invitePath}`}`);
      setCopied(false);
      setLabel('');
      setRole('member');
      setMaxUses(1);
      setExpiresHours(72);
      setAllLibs(true);
      setLibIds([]);
      setRequireTOTP(false);
      onChanged();
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Failed to create invite');
    }
  }

  async function handleCopy() {
    if (!createdLink) return;
    await navigator.clipboard.writeText(createdLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const [clearing, setClearing] = useState(false);

  const inactiveCount = invites.filter((inv) => inv.status !== 'active').length;

  async function handleRevoke(id: string) {
    setErr('');
    try {
      await api.revokeInvite(id);
      onChanged();
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Failed to revoke invite');
    }
  }

  async function handleClearInactive() {
    if (clearing || inactiveCount === 0) return;
    setClearing(true);
    setErr('');
    try {
      await api.clearInactiveInvites();
      onChanged();
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Failed to clear invite history');
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-surface border border-tone/[0.08] p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Create Invite Link</h2>
          <p className="text-xs text-ink-secondary mt-0.5">
            Generate a time-limited onboarding link so new users can choose their own username and password.
          </p>
        </div>

        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <input
              type="text"
              placeholder="Label / note (e.g. For Alex)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="md:col-span-4 rounded-lg bg-canvas border border-hairline px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'member' | 'admin')}
              className="md:col-span-2 rounded-lg bg-canvas border border-hairline px-3 py-2 text-sm text-ink focus:outline-none focus:border-tone/50"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <label className="md:col-span-2 flex items-center gap-2 rounded-lg bg-canvas border border-hairline px-3 py-2 text-xs text-ink-secondary">
              <span>Uses</span>
              <input
                type="number"
                min={1}
                max={100}
                value={maxUses}
                onChange={(e) => setMaxUses(Number(e.target.value) || 1)}
                className="w-full bg-transparent text-sm tabular-nums text-ink focus:outline-none"
              />
            </label>
            <select
              value={expiresHours}
              onChange={(e) => setExpiresHours(Number(e.target.value))}
              className="md:col-span-2 rounded-lg bg-canvas border border-hairline px-3 py-2 text-sm text-ink focus:outline-none focus:border-tone/50"
            >
              <option value={24}>24 hours</option>
              <option value={72}>3 days</option>
              <option value={168}>7 days</option>
              <option value={720}>30 days</option>
            </select>
            <button
              type="submit"
              className="md:col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent hover:bg-accent-hover text-on-accent font-semibold text-sm px-3 py-2 transition-colors cursor-pointer"
            >
              <Link2 className="w-4 h-4" />
              Create Link
            </button>
          </div>

          <div className="rounded-lg bg-canvas/60 border border-tone/[0.08] px-3.5 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2.5 text-xs">
            <label className="inline-flex items-center gap-2 text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={requireTOTP}
                onChange={(e) => setRequireTOTP(e.target.checked)}
                className="accent-accent"
              />
              Require 2FA on signup
            </label>

            {role === 'member' && libraries.length > 0 && (
              <>
                <label className="inline-flex items-center gap-2 text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allLibs}
                    onChange={(e) => setAllLibs(e.target.checked)}
                    className="accent-accent"
                  />
                  Access to all libraries
                </label>
                {!allLibs && (
                  <div className="flex flex-wrap items-center gap-2 pl-2 border-l border-tone/[0.08]">
                    {libraries.map((lib) => (
                      <label
                        key={lib.id}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface border border-hairline text-ink cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={libIds.includes(lib.id)}
                          onChange={() => toggleLib(lib.id)}
                          className="accent-accent"
                        />
                        {lib.name}
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </form>

        {createdLink && (
          <div className="rounded-lg bg-healthy/10 border border-healthy/30 p-3.5 space-y-2">
            <div className="text-xs font-medium text-healthy">
              Invite created — copy this link now (the full token is only shown once)
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={createdLink}
                className="flex-1 rounded-lg bg-canvas border border-hairline px-3 py-1.5 text-xs font-mono text-ink"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-elevated hover:bg-hairline text-xs font-medium text-ink px-3 py-1.5 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-healthy" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {err && (
          <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">
            {err}
          </div>
        )}
      </div>

      {/* Invite History */}
      <div className="rounded-xl bg-surface border border-tone/[0.08] p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold text-ink">Invitations ({invites.length})</h3>
          {inactiveCount > 0 && (
            <button
              type="button"
              disabled={clearing}
              onClick={handleClearInactive}
              className="inline-flex items-center gap-1.5 rounded-lg bg-canvas border border-hairline hover:border-tone/35 hover:text-ink text-xs text-ink-secondary px-2.5 py-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {clearing ? 'Clearing…' : `Clear inactive (${inactiveCount})`}
            </button>
          )}
        </div>
        {invites.length === 0 ? (
          <p className="text-xs text-ink-muted py-4">No invite links created yet.</p>
        ) : (
          <div className="divide-y divide-tone/[0.08]">
            {invites.map((inv) => {
              const statusClass =
                inv.status === 'active'
                  ? 'bg-healthy/15 text-healthy'
                  : inv.status === 'exhausted'
                    ? 'bg-telemetry/15 text-telemetry'
                    : inv.status === 'revoked'
                      ? 'bg-danger/15 text-danger'
                      : 'bg-warning/15 text-warning';
              return (
                <div key={inv.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-ink">
                        {inv.label || `Invite ${inv.token_prefix}…`}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ${statusClass}`}>
                        {inv.status}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-elevated text-[10px] font-medium uppercase tracking-wide text-ink">
                        {inv.role}
                      </span>
                      {inv.require_totp && (
                        <span className="px-2 py-0.5 rounded-full bg-healthy/15 text-[10px] font-medium uppercase tracking-wide text-healthy">
                          2FA required
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] tabular-nums text-ink-secondary mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span>token {inv.token_prefix}…</span>
                      <span>
                        uses {inv.use_count}/{inv.max_uses}
                      </span>
                      <span>
                        {inv.all_libraries
                          ? 'all libraries'
                          : `${inv.library_ids.length} ${inv.library_ids.length === 1 ? 'library' : 'libraries'}`}
                      </span>
                      <span className="text-ink-muted">
                        expires {new Date(inv.expires_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {inv.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(inv.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-canvas border border-hairline hover:border-danger/60 hover:text-danger text-xs text-ink-secondary px-2.5 py-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Revoke
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
