import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Copy, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { encode as encodeQR } from 'uqr';
import { api, ApiError, type TOTPSetupResponse, type User } from '../lib/api';
import { LuneMark } from './LuneMark';
import { ThemeSwitcher } from './ThemeSwitcher';

interface Props {
  user: User;
  onCompleted: () => void;
  onSignOut: () => void;
}

export function TotpEnrollmentScreen({ user, onCompleted, onSignOut }: Props) {
  const [setup, setSetup] = useState<TOTPSetupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showManualKey, setShowManualKey] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .beginTOTPSetup()
      .then((res) => {
        if (!cancelled) setSetup(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to initialize 2FA setup');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const qrMatrix = useMemo(() => {
    if (!setup?.otpauth_url) return null;
    return encodeQR(setup.otpauth_url, { ecc: 'M', border: 2 });
  }, [setup?.otpauth_url]);

  async function handleEnable(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.enableTOTP({ password, code: code.trim() });
      setRecoveryCodes(res.recovery_codes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to verify 2FA code');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="lune-backdrop min-h-dvh flex flex-col p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
        <ThemeSwitcher variant="labeled" />
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-1.5 rounded-lg bg-surface/80 hover:bg-elevated border border-tone/10 px-3 py-1.5 text-xs text-ink-secondary hover:text-ink transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl bg-surface/85 backdrop-blur-xl backdrop-saturate-150 border border-tone/10 p-5 sm:p-7 shadow-[0_20px_60px_rgba(0,0,0,0.35)] space-y-5">
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-elevated to-canvas border border-tone/12 flex items-center justify-center shadow-lg mb-3">
            <LuneMark alt="Lune" className="w-9 h-9" />
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-healthy mb-1">
            <ShieldCheck className="w-4 h-4" />
            Two-Factor Authentication Required
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            Secure your account, {user.display_name}
          </h1>
          <p className="text-xs text-ink-secondary mt-1">
            Your server administrator requires 2FA before accessing Lune.
          </p>
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center gap-2 text-xs text-ink-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating authenticator key…
          </div>
        ) : recoveryCodes ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-healthy/10 border border-healthy/30 p-4 space-y-2.5">
              <div className="text-xs font-semibold text-healthy">
                2FA Enabled — Save Your Recovery Codes
              </div>
              <p className="text-[11px] text-ink-secondary leading-relaxed">
                Store these one-time recovery codes somewhere safe. Each code can be used once if
                you lose access to your authenticator app.
              </p>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-xs text-ink">
                {recoveryCodes.map((c) => (
                  <div
                    key={c}
                    className="rounded bg-canvas/80 border border-hairline px-2 py-1 text-center select-all"
                  >
                    {c}
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={onCompleted}
              className="w-full rounded-lg bg-accent hover:bg-accent-hover text-on-accent font-semibold text-sm py-2.5 transition-colors cursor-pointer"
            >
              Continue to Lune
            </button>
          </div>
        ) : (
          <form onSubmit={handleEnable} className="space-y-4">
            <p className="text-xs text-ink-secondary text-center leading-relaxed">
              Scan this QR code with your authenticator app (1Password, Apple Passwords, Bitwarden,
              Google Authenticator), then confirm below.
            </p>

            {qrMatrix && setup && (
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-xl bg-white p-2.5 shadow-sm border border-tone/10">
                  <svg
                    viewBox={`0 0 ${qrMatrix.size} ${qrMatrix.size}`}
                    className="w-44 h-44 block"
                    shapeRendering="crispEdges"
                    role="img"
                    aria-label="Two-factor authentication QR code"
                  >
                    <rect width={qrMatrix.size} height={qrMatrix.size} fill="#FFFFFF" />
                    {qrMatrix.data.map((row, y) =>
                      row.map((cell, x) =>
                        cell ? (
                          <rect
                            key={`${x}-${y}`}
                            x={x}
                            y={y}
                            width={1}
                            height={1}
                            fill="#09090B"
                          />
                        ) : null
                      )
                    )}
                  </svg>
                </div>
                <button
                  type="button"
                  onClick={() => setShowManualKey((v) => !v)}
                  className="text-[11px] text-ink-secondary hover:text-ink underline underline-offset-2 cursor-pointer"
                >
                  {showManualKey ? 'Hide manual setup key' : "Can't scan? Enter setup key manually"}
                </button>
              </div>
            )}

            {showManualKey && setup && (
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-canvas border border-hairline px-2.5 py-1.5 text-xs font-mono text-ink break-all select-all">
                  {setup.secret}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(setup.secret).catch(() => {});
                    setCopiedSecret(true);
                    setTimeout(() => setCopiedSecret(false), 1800);
                  }}
                  className="p-2 rounded-lg bg-elevated hover:bg-hairline text-ink-secondary hover:text-ink cursor-pointer"
                  title="Copy secret"
                >
                  {copiedSecret ? <Check className="w-3.5 h-3.5 text-healthy" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-ink-secondary mb-1">
                  Confirm password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg bg-canvas border border-hairline px-3.5 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-secondary mb-1">
                  6-digit authenticator code
                </label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  className="w-full rounded-lg bg-canvas border border-hairline px-3.5 py-2 text-sm font-mono tracking-wider text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-danger/10 border border-danger/30 px-3.5 py-2.5 text-xs text-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !password || code.trim().length < 6}
              className="w-full rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent font-semibold text-sm py-2.5 transition-colors cursor-pointer"
            >
              {submitting ? 'Verifying…' : 'Verify & Enable 2FA'}
            </button>
          </form>
        )}
      </div>
      </div>
    </div>
  );
}
