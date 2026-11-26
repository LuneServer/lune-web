import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type InviteInspect, type SystemInfo, type User } from '../lib/api';
import { LuneMark } from './LuneMark';
import { ThemeSwitcher } from './ThemeSwitcher';

interface Props {
  systemInfo: SystemInfo;
  inviteToken?: string;
  onClearInvite?: () => void;
  onAuthenticated: (user: User) => void;
}

export function AuthScreen({ systemInfo, inviteToken, onClearInvite, onAuthenticated }: Props) {
  const isSetup = systemInfo.setup_required;
  const isInvite = !isSetup && Boolean(inviteToken);

  const [inviteInfo, setInviteInfo] = useState<InviteInspect | null>(null);
  const [inviteLoading, setInviteLoading] = useState(isInvite);
  const [inviteErr, setInviteErr] = useState('');

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isInvite || !inviteToken) {
      setInviteInfo(null);
      setInviteLoading(false);
      setInviteErr('');
      return;
    }
    let cancelled = false;
    setInviteLoading(true);
    setInviteErr('');
    api
      .inspectInvite(inviteToken)
      .then((info) => {
        if (!cancelled) setInviteInfo(info);
      })
      .catch((err) => {
        if (!cancelled) {
          setInviteErr(err instanceof ApiError ? err.message : 'This invitation link is invalid or expired.');
        }
      })
      .finally(() => {
        if (!cancelled) setInviteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isInvite, inviteToken]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = isSetup
        ? await api.setup({ username, display_name: displayName || undefined, password })
        : isInvite && inviteToken
          ? await api.acceptInvite(inviteToken, {
              username,
              display_name: displayName || undefined,
              password,
            })
          : await api.login({
              username,
              password,
              totp_code: totpRequired ? totpCode.trim() : undefined,
            });
      onAuthenticated(res.user);
    } catch (err) {
      if (err instanceof ApiError && err.totpRequired) {
        setTotpRequired(true);
        setError('');
      } else {
        setError(err instanceof ApiError ? err.message : 'Unable to reach Lune Server');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="lune-backdrop min-h-screen flex items-center justify-center p-6 relative">
      <div className="absolute top-5 right-5">
        <ThemeSwitcher variant="labeled" />
      </div>

      <div className="w-full max-w-md rounded-2xl bg-surface/80 backdrop-blur-xl backdrop-saturate-150 border border-tone/10 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-elevated to-canvas border border-tone/12 flex items-center justify-center shadow-lg mb-4">
            <LuneMark alt="Lune" className="w-11 h-11" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Lune</h1>
          <p className="text-sm text-ink-secondary mt-1">{systemInfo.tagline}</p>
        </div>

        {isInvite && inviteLoading ? (
          <div className="py-10 text-center text-xs text-ink-secondary">Validating invitation…</div>
        ) : isInvite && inviteErr ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-danger/10 border border-danger/30 px-4 py-3 text-xs text-danger">
              {inviteErr}
            </div>
            {onClearInvite && (
              <button
                type="button"
                onClick={onClearInvite}
                className="w-full rounded-lg bg-elevated hover:bg-hairline text-ink font-medium text-sm py-2.5 transition-colors cursor-pointer"
              >
                Back to sign in
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-base font-semibold text-ink">
                {isSetup ? 'Initialize your server' : isInvite ? 'Accept invitation' : 'Sign in'}
              </h2>
              <p className="text-xs text-ink-secondary mt-1">
                {isSetup
                  ? 'Create the primary administrator account for this Lune node.'
                  : isInvite
                    ? `Create your ${inviteInfo?.role ?? 'member'} account${inviteInfo?.label ? ` (${inviteInfo.label})` : ''} to join this Lune server.`
                    : 'Authenticate to browse and stream your personal media library.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink-secondary mb-1.5">Username</label>
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="dan"
                  className="w-full rounded-lg bg-canvas border border-hairline px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50 transition-colors"
                />
              </div>

              {(isSetup || isInvite) && (
                <div>
                  <label className="block text-xs font-medium text-ink-secondary mb-1.5">Display name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg bg-canvas border border-hairline px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50 transition-colors"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-ink-secondary mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  minLength={isSetup || isInvite ? 8 : 1}
                  autoComplete={isSetup || isInvite ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSetup || isInvite ? 'Minimum 8 characters' : '••••••••'}
                  className="w-full rounded-lg bg-canvas border border-hairline px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50 transition-colors"
                />
              </div>

              {totpRequired && !isSetup && !isInvite && (
                <div>
                  <label className="block text-xs font-medium text-ink-secondary mb-1.5">
                    Authenticator or recovery code
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    autoComplete="one-time-code"
                    inputMode="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="123456 or XXXX-XXXX"
                    className="w-full rounded-lg bg-canvas border border-tone/40 px-3.5 py-2.5 text-sm font-mono tracking-wider text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/70 transition-colors"
                  />
                  <p className="text-[11px] text-ink-muted mt-1">
                    Enter the 6-digit code from your authenticator app or a one-time recovery code.
                  </p>
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-danger/10 border border-danger/30 px-3.5 py-2.5 text-xs text-danger">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-60 text-on-accent font-semibold text-sm py-2.5 transition-colors cursor-pointer"
              >
                {submitting
                  ? 'Authenticating…'
                  : isSetup
                    ? 'Create Administrator'
                    : isInvite
                      ? 'Create Account'
                      : 'Enter Lune'}
              </button>

              {isInvite && onClearInvite && (
                <button
                  type="button"
                  onClick={onClearInvite}
                  className="w-full text-center text-xs text-ink-secondary hover:text-ink pt-1 cursor-pointer"
                >
                  Already have an account? Sign in
                </button>
              )}
            </form>
          </>
        )}

        <div className="mt-6 pt-5 border-t border-tone/[0.08] flex items-center justify-between text-[11px] tabular-nums text-ink-muted">
          <span>{systemInfo.version}</span>
          <span>edge: {systemInfo.edge_mode}</span>
        </div>
      </div>
    </div>
  );
}
