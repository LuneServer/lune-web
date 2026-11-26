import { useState, type FormEvent } from 'react';
import { Tv, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';

export function DevicePair() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const [message, setMessage] = useState('');

  async function handleApprove(e: FormEvent) {
    e.preventDefault();
    setStatus('idle');
    setMessage('');
    try {
      await api.approveDevice(code);
      setStatus('ok');
      setMessage('Device authorized. Your app will sign in automatically within a few seconds.');
      setCode('');
    } catch (err) {
      setStatus('err');
      setMessage(err instanceof ApiError ? err.message : 'Invalid or expired code');
    }
  }

  return (
    <div className="max-w-md mx-auto rounded-2xl bg-surface border border-tone/10 p-7">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-tone/10 border border-tone/15 flex items-center justify-center text-ink">
          <Tv className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-ink">Pair a TV or Mobile App</h2>
          <p className="text-xs text-ink-secondary">Enter the 8-character code displayed on your device.</p>
        </div>
      </div>

      <form onSubmit={handleApprove} className="space-y-4">
        <input
          type="text"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="K7MP-4WQX"
          className="w-full text-center tracking-[0.25em] font-semibold tabular-nums text-xl rounded-xl bg-canvas border border-hairline py-3.5 text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
        />
        <button
          type="submit"
          className="w-full rounded-lg bg-accent hover:bg-accent-hover text-on-accent font-semibold text-sm py-2.5 transition-colors cursor-pointer"
        >
          Authorize Device
        </button>
      </form>

      {status === 'ok' && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-healthy/10 border border-healthy/30 p-3 text-xs text-healthy">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{message}</span>
        </div>
      )}
      {status === 'err' && (
        <div className="mt-4 rounded-lg bg-danger/10 border border-danger/30 p-3 text-xs text-danger">
          {message}
        </div>
      )}
    </div>
  );
}
