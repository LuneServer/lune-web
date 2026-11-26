import { useState, type FormEvent } from 'react';
import {
  Ban,
  CheckCircle,
  KeyRound,
  Laptop,
  Pencil,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  api,
  ApiError,
  type AdminUser,
  type Library,
  type SessionInfo,
} from '../../lib/api';

interface Props {
  currentUserId: string;
  users: AdminUser[];
  libraries: Library[];
  onChanged: () => void;
}

export function ConsoleUsers({ currentUserId, users, libraries, onChanged }: Props) {
  // Create user form
  const [newUsername, setNewUsername] = useState('');
  const [newDisplay, setNewDisplay] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'member' | 'admin'>('member');
  const [newAllLibs, setNewAllLibs] = useState(true);
  const [newLibIds, setNewLibIds] = useState<string[]>([]);
  const [newRequireTOTP, setNewRequireTOTP] = useState(false);
  const [userErr, setUserErr] = useState('');

  // Inline panels per user
  const [editUserId, setEditUserId] = useState('');
  const [editDisplay, setEditDisplay] = useState('');
  const [editRole, setEditRole] = useState<'member' | 'admin'>('member');
  const [editAllLibs, setEditAllLibs] = useState(true);
  const [editLibIds, setEditLibIds] = useState<string[]>([]);
  const [editCanRequest, setEditCanRequest] = useState(true);
  const [editAutoApprove, setEditAutoApprove] = useState(false);
  const [editRequireTOTP, setEditRequireTOTP] = useState(false);

  const [resetUserId, setResetUserId] = useState('');
  const [resetPassword, setResetPassword] = useState('');

  const [sessionsUserId, setSessionsUserId] = useState('');
  const [userSessions, setUserSessions] = useState<SessionInfo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  function toggleLib(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setUserErr('');
    try {
      await api.createUser({
        username: newUsername,
        display_name: newDisplay || undefined,
        password: newPassword,
        role: newRole,
        all_libraries: newRole === 'admin' ? true : newAllLibs,
        library_ids: newRole === 'admin' || newAllLibs ? undefined : newLibIds,
        totp_required: newRequireTOTP,
      });
      setNewUsername('');
      setNewDisplay('');
      setNewPassword('');
      setNewRole('member');
      setNewAllLibs(true);
      setNewLibIds([]);
      setNewRequireTOTP(false);
      onChanged();
    } catch (err) {
      setUserErr(err instanceof ApiError ? err.message : 'Failed to create user');
    }
  }

  function openEdit(u: AdminUser) {
    if (editUserId === u.id) {
      setEditUserId('');
      return;
    }
    setResetUserId('');
    setSessionsUserId('');
    setEditUserId(u.id);
    setEditDisplay(u.display_name);
    setEditRole(u.role);
    setEditAllLibs(u.all_libraries);
    setEditLibIds(u.library_ids ?? []);
    setEditCanRequest(u.can_request ?? true);
    setEditAutoApprove(u.auto_approve_requests ?? false);
    setEditRequireTOTP(Boolean(u.totp_required));
  }

  async function handleSaveEdit(e: FormEvent, u: AdminUser) {
    e.preventDefault();
    setUserErr('');
    try {
      await api.updateUser(u.id, {
        display_name: editDisplay,
        role: u.id === currentUserId ? undefined : editRole,
        all_libraries: editRole === 'admin' ? true : editAllLibs,
        library_ids: editRole === 'admin' || editAllLibs ? undefined : editLibIds,
        can_request: editRole === 'admin' ? true : editCanRequest,
        auto_approve_requests: editRole === 'admin' ? true : editAutoApprove,
        totp_required: editRequireTOTP,
      });
      setEditUserId('');
      onChanged();
    } catch (err) {
      setUserErr(err instanceof ApiError ? err.message : 'Failed to update user');
    }
  }

  async function openSessions(u: AdminUser) {
    if (sessionsUserId === u.id) {
      setSessionsUserId('');
      return;
    }
    setEditUserId('');
    setResetUserId('');
    setSessionsUserId(u.id);
    setLoadingSessions(true);
    try {
      const res = await api.listUserSessions(u.id);
      setUserSessions(res.sessions);
    } catch (err) {
      setUserErr(err instanceof ApiError ? err.message : 'Failed to load sessions');
    } finally {
      setLoadingSessions(false);
    }
  }

  async function handleRevokeAllSessions(u: AdminUser) {
    setUserErr('');
    try {
      await api.revokeUserSessions(u.id);
      setUserSessions([]);
      onChanged();
    } catch (err) {
      setUserErr(err instanceof ApiError ? err.message : 'Failed to revoke sessions');
    }
  }

  async function handleToggleDisabled(u: AdminUser) {
    setUserErr('');
    try {
      await api.updateUser(u.id, { disabled: !u.disabled });
      onChanged();
    } catch (err) {
      setUserErr(err instanceof ApiError ? err.message : 'Failed to update user');
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    setUserErr('');
    try {
      await api.updateUser(resetUserId, { password: resetPassword });
      setResetUserId('');
      setResetPassword('');
      onChanged();
    } catch (err) {
      setUserErr(err instanceof ApiError ? err.message : 'Failed to reset password');
    }
  }

  async function handleDeleteUser(u: AdminUser) {
    setUserErr('');
    try {
      await api.deleteUser(u.id);
      onChanged();
    } catch (err) {
      setUserErr(err instanceof ApiError ? err.message : 'Failed to delete user');
    }
  }

  async function handleResetTOTP(u: AdminUser) {
    setUserErr('');
    try {
      await api.adminResetUserTOTP(u.id);
      onChanged();
    } catch (err) {
      setUserErr(err instanceof ApiError ? err.message : 'Failed to reset 2FA');
    }
  }

  return (
    <div className="space-y-6">
      {/* Create User */}
      <div className="rounded-xl bg-surface border border-tone/[0.08] p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Create User</h2>
          <p className="text-xs text-ink-secondary mt-0.5">
            Add family or member accounts with separate watch progress, preferences, and library permissions.
          </p>
        </div>

        <form onSubmit={handleCreateUser} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <input
              type="text"
              required
              placeholder="Username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="md:col-span-3 rounded-lg bg-canvas border border-hairline px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
            />
            <input
              type="text"
              placeholder="Display name"
              value={newDisplay}
              onChange={(e) => setNewDisplay(e.target.value)}
              className="md:col-span-2 rounded-lg bg-canvas border border-hairline px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="Password (min 8)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="md:col-span-3 rounded-lg bg-canvas border border-hairline px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'member' | 'admin')}
              className="md:col-span-2 rounded-lg bg-canvas border border-hairline px-3 py-2 text-sm text-ink focus:outline-none focus:border-tone/50"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              className="md:col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent hover:bg-accent-hover text-on-accent font-semibold text-sm px-3 py-2 transition-colors cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Add User
            </button>
          </div>

          <div className="rounded-lg bg-canvas/60 border border-tone/[0.08] px-3.5 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2.5 text-xs">
            <label className="inline-flex items-center gap-2 text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={newRequireTOTP}
                onChange={(e) => setNewRequireTOTP(e.target.checked)}
                className="accent-accent"
              />
              Require 2FA on first sign-in
            </label>

            {newRole === 'member' && libraries.length > 0 && (
              <>
                <label className="inline-flex items-center gap-2 text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAllLibs}
                    onChange={(e) => setNewAllLibs(e.target.checked)}
                    className="accent-accent"
                  />
                  Access to all libraries
                </label>
                {!newAllLibs && (
                  <div className="flex flex-wrap items-center gap-2 pl-2 border-l border-tone/[0.08]">
                    {libraries.map((lib) => (
                      <label
                        key={lib.id}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface border border-hairline text-ink cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={newLibIds.includes(lib.id)}
                          onChange={() => setNewLibIds((prev) => toggleLib(prev, lib.id))}
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

        {userErr && (
          <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">
            {userErr}
          </div>
        )}
      </div>

      {/* Existing Accounts */}
      <div className="rounded-xl bg-surface border border-tone/[0.08] p-5">
        <h3 className="text-sm font-semibold text-ink mb-3">
          Accounts ({users.length})
        </h3>

        <div className="divide-y divide-tone/[0.08]">
          {users.map((u) => {
            const isSelf = u.id === currentUserId;
            const libSummary = u.all_libraries
              ? 'All libraries'
              : `${u.library_ids?.length ?? 0} of ${libraries.length} libraries`;
            return (
              <div key={u.id} className="py-3.5 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {u.avatar_url ? (
                      <img
                        src={u.avatar_url}
                        alt={u.display_name}
                        className="w-8 h-8 rounded-full object-cover border border-tone/14 shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-elevated border border-tone/10 flex items-center justify-center text-xs font-semibold text-ink shrink-0">
                        {u.display_name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-ink">{u.display_name}</span>
                        <span className="text-xs text-ink-muted">@{u.username}</span>
                        <span className="px-2 py-0.5 rounded-full bg-elevated text-[10px] font-medium uppercase tracking-wide text-ink">
                          {u.role}
                        </span>
                        {u.totp_enabled && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-healthy/15 text-[10px] font-medium uppercase tracking-wide text-healthy">
                            <ShieldCheck className="w-3 h-3" />
                            2FA
                          </span>
                        )}
                        {u.totp_required && !u.totp_enabled && (
                          <span className="px-2 py-0.5 rounded-full bg-warning/15 text-[10px] font-medium uppercase tracking-wide text-warning">
                            2FA required
                          </span>
                        )}
                        {u.disabled && (
                          <span className="px-2 py-0.5 rounded-full bg-danger/15 text-[10px] font-medium uppercase tracking-wide text-danger">
                            disabled
                          </span>
                        )}
                        {isSelf && (
                          <span className="text-[10px] font-medium text-telemetry">(you)</span>
                        )}
                      </div>
                      <div className="text-[11px] tabular-nums text-ink-secondary mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span>{libSummary}</span>
                        <span>
                          {u.active_sessions} active {u.active_sessions === 1 ? 'session' : 'sessions'}
                        </span>
                        {u.role !== 'admin' && u.can_request === false && (
                          <span className="text-ink-muted">requests off</span>
                        )}
                        {u.role !== 'admin' && u.can_request !== false && u.auto_approve_requests && (
                          <span className="text-telemetry">auto-approve requests</span>
                        )}
                        {u.last_login_at && (
                          <span className="text-ink-muted">
                            last login {new Date(u.last_login_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      className="inline-flex items-center gap-1 rounded-lg bg-canvas border border-hairline hover:border-accent/60 text-xs text-ink px-2.5 py-1.5 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => openSessions(u)}
                      className="inline-flex items-center gap-1 rounded-lg bg-canvas border border-hairline hover:border-accent/60 text-xs text-ink px-2.5 py-1.5 cursor-pointer"
                    >
                      <Laptop className="w-3.5 h-3.5" />
                      Sessions
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditUserId('');
                        setSessionsUserId('');
                        setResetUserId(resetUserId === u.id ? '' : u.id);
                        setResetPassword('');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-canvas border border-hairline hover:border-accent/60 text-xs text-ink px-2.5 py-1.5 cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      Reset PW
                    </button>
                    {u.totp_enabled && (
                      <button
                        type="button"
                        onClick={() => handleResetTOTP(u)}
                        title="Disable 2FA for this account (recovery)"
                        className="inline-flex items-center gap-1 rounded-lg bg-canvas border border-hairline hover:border-warning/60 text-xs text-ink px-2.5 py-1.5 cursor-pointer"
                      >
                        <ShieldOff className="w-3.5 h-3.5 text-warning" />
                        Reset 2FA
                      </button>
                    )}
                    {!isSelf && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleToggleDisabled(u)}
                          className="inline-flex items-center gap-1 rounded-lg bg-elevated hover:bg-hairline text-xs text-ink px-2.5 py-1.5 cursor-pointer"
                        >
                          {u.disabled ? (
                            <>
                              <CheckCircle className="w-3.5 h-3.5 text-healthy" /> Enable
                            </>
                          ) : (
                            <>
                              <Ban className="w-3.5 h-3.5 text-warning" /> Disable
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          className="p-1.5 rounded-lg text-ink-secondary hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Inline Edit Panel */}
                {editUserId === u.id && (
                  <form
                    onSubmit={(e) => handleSaveEdit(e, u)}
                    className="rounded-lg bg-canvas/70 border border-tone/[0.08] p-3.5 space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-ink-secondary mb-1">Display Name</label>
                        <input
                          type="text"
                          required
                          value={editDisplay}
                          onChange={(e) => setEditDisplay(e.target.value)}
                          className="w-full rounded-lg bg-canvas border border-hairline px-3 py-1.5 text-xs text-ink focus:outline-none focus:border-tone/50"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-ink-secondary mb-1">Role</label>
                        <select
                          disabled={isSelf}
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value as 'member' | 'admin')}
                          className="w-full rounded-lg bg-canvas border border-hairline disabled:opacity-60 px-3 py-1.5 text-xs text-ink focus:outline-none focus:border-tone/50"
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div className="flex items-end gap-2">
                        <button
                          type="submit"
                          className="rounded-lg bg-accent hover:bg-accent-hover text-on-accent font-semibold text-xs px-3.5 py-1.5 cursor-pointer"
                        >
                          Save Changes
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditUserId('')}
                          className="rounded-lg bg-elevated text-xs text-ink-secondary hover:text-ink px-3 py-1.5 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-tone/[0.08] flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                      <label className="inline-flex items-center gap-2 text-ink cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editRequireTOTP}
                          onChange={(e) => setEditRequireTOTP(e.target.checked)}
                          className="accent-accent"
                        />
                        Require Two-Factor Authentication (2FA)
                      </label>
                    </div>

                    {editRole === 'member' && (
                      <div className="pt-2 border-t border-tone/[0.08] flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                        <label className="inline-flex items-center gap-2 text-ink cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editCanRequest}
                            onChange={(e) => {
                              const next = e.target.checked;
                              setEditCanRequest(next);
                              if (!next) setEditAutoApprove(false);
                            }}
                            className="accent-accent"
                          />
                          Can Request
                        </label>
                        <label
                          className={`inline-flex items-center gap-2 text-ink ${
                            editCanRequest ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={!editCanRequest}
                            checked={editAutoApprove}
                            onChange={(e) => setEditAutoApprove(e.target.checked)}
                            className="accent-accent"
                          />
                          Auto-Approve Requests
                        </label>
                      </div>
                    )}

                    {editRole === 'member' && libraries.length > 0 && (
                      <div className="pt-2 border-t border-tone/[0.08] flex flex-wrap items-center gap-3 text-xs">
                        <label className="inline-flex items-center gap-2 text-ink cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editAllLibs}
                            onChange={(e) => setEditAllLibs(e.target.checked)}
                            className="accent-accent"
                          />
                          Access to all libraries
                        </label>
                        {!editAllLibs && (
                          <div className="flex flex-wrap items-center gap-2 pl-2 border-l border-tone/[0.08]">
                            {libraries.map((lib) => (
                              <label
                                key={lib.id}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface border border-hairline text-ink cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={editLibIds.includes(lib.id)}
                                  onChange={() => setEditLibIds((prev) => toggleLib(prev, lib.id))}
                                  className="accent-accent"
                                />
                                {lib.name}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </form>
                )}

                {/* Inline Sessions Panel */}
                {sessionsUserId === u.id && (
                  <div className="rounded-lg bg-canvas/70 border border-tone/[0.08] p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-ink">
                        Active Sessions for @{u.username}
                      </span>
                      {userSessions.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleRevokeAllSessions(u)}
                          className="text-xs font-medium text-danger hover:underline cursor-pointer"
                        >
                          Revoke all sessions
                        </button>
                      )}
                    </div>
                    {loadingSessions ? (
                      <p className="text-xs text-ink-secondary">Loading sessions…</p>
                    ) : userSessions.length === 0 ? (
                      <p className="text-xs text-ink-muted">No active sessions.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {userSessions.map((s) => (
                          <div
                            key={s.id}
                            className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums text-ink-secondary bg-surface/80 rounded-md px-3 py-1.5"
                          >
                            <div>
                              <span className="text-ink">{s.client_name || s.client_kind}</span>
                              {s.current && <span className="ml-2 text-healthy">(current)</span>}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-ink-muted">
                              <span>{s.ip_address || 'local'}</span>
                              <span>seen {new Date(s.last_seen_at).toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Inline Password Reset */}
                {resetUserId === u.id && (
                  <form onSubmit={handleResetPassword} className="flex items-center gap-2 pt-1">
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder="New password (min 8 chars)"
                      className="flex-1 max-w-xs rounded-lg bg-canvas border border-hairline px-3 py-1.5 text-xs text-ink focus:outline-none focus:border-tone/50"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-accent text-on-accent font-semibold text-xs px-3 py-1.5 cursor-pointer"
                    >
                      Save Password
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
