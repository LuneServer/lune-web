import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Globe,
  Home,
  Info,
  Loader2,
  Lock,
  Network,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { api, ApiError, type EdgeMode, type IPBan, type NetworkConfig } from '../../lib/api';

interface Props {
  onNetworkConfigChange?: (cfg: NetworkConfig) => void;
}

function normalizeEdgeMode(mode?: string | null): EdgeMode {
  switch ((mode ?? '').trim().toLowerCase()) {
    case 'acme':
      return 'acme';
    case 'proxy':
      return 'proxy';
    case 'tailscale':
      return 'tailscale';
    case 'dev':
    case 'local':
    default:
      return 'local';
  }
}

function normalizeNetworkConfig(raw?: Partial<NetworkConfig> | null): NetworkConfig {
  return {
    edge_mode: normalizeEdgeMode(raw?.edge_mode),
    active_edge_mode: raw?.active_edge_mode ? normalizeEdgeMode(raw.active_edge_mode) : undefined,
    restart_required: Boolean(raw?.restart_required),
    public_url: raw?.public_url ?? '',
    trusted_proxies: raw?.trusted_proxies ?? '',
    domain: raw?.domain ?? '',
    acme_email: raw?.acme_email ?? '',
    acme_staging: Boolean(raw?.acme_staging),
    acme_dns_provider: raw?.acme_dns_provider === 'cloudflare' ? 'cloudflare' : '',
    cf_api_token: raw?.cf_api_token ?? '',
    has_cf_api_token: Boolean(raw?.has_cf_api_token),
    admin_lan_only: Boolean(raw?.admin_lan_only),
    ip_allowlist: raw?.ip_allowlist ?? '',
    ip_blocklist: raw?.ip_blocklist ?? '',
  };
}

const DEFAULT_CONFIG: NetworkConfig = normalizeNetworkConfig();

const MODE_CARDS: {
  id: EdgeMode;
  title: string;
  badge: string;
  description: string;
  icon: typeof Home;
}[] = [
  {
    id: 'local',
    title: 'Entirely Local',
    badge: 'local',
    description: 'LAN HTTP on port 5863. No external exposure, TLS, or proxy headers.',
    icon: Home,
  },
  {
    id: 'acme',
    title: 'Lune Built-in HTTPS',
    badge: 'acme',
    description:
      "Automatic Let's Encrypt TLS directly in Lune on ports 443 & 80. Zero reverse proxy needed.",
    icon: ShieldCheck,
  },
  {
    id: 'proxy',
    title: 'Reverse Proxy',
    badge: 'proxy',
    description:
      'Behind Nginx Proxy Manager, SWAG, Traefik, or Caddy on port 5863. Trusts X-Forwarded headers automatically.',
    icon: Globe,
  },
  {
    id: 'tailscale',
    title: 'Tailscale',
    badge: 'tailscale',
    description:
      'Private mesh access via Tailscale Serve on port 5863. Zero open ports, works behind CGNAT.',
    icon: Network,
  },
];

export function ConsoleNetwork({ onNetworkConfigChange }: Props) {
  const [cfg, setCfg] = useState<NetworkConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [saveState, setSaveState] = useState<'none' | 'live' | 'restart'>('none');
  const [bans, setBans] = useState<IPBan[]>([]);
  const [banIP, setBanIP] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banMinutes, setBanMinutes] = useState('60');
  const [banBusy, setBanBusy] = useState(false);
  const [banErr, setBanErr] = useState('');

  async function loadBans() {
    try {
      const res = await api.adminListIPBans();
      setBans(res.bans ?? []);
    } catch {
      // Non-fatal if bans endpoint unavailable
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    Promise.all([api.adminGetNetworkConfig(), api.adminListIPBans().catch(() => ({ bans: [] }))])
      .then(([res, banRes]) => {
        if (!cancelled) {
          setCfg(normalizeNetworkConfig(res));
          setBans(banRes.bans ?? []);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErr(error instanceof ApiError ? error.message : 'Failed to load network settings');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleManualBan() {
    const ip = banIP.trim();
    if (!ip) return;
    setBanErr('');
    setBanBusy(true);
    try {
      const mins = Math.max(0, parseInt(banMinutes, 10) || 0);
      await api.adminBanIP({
        ip,
        reason: banReason.trim() || undefined,
        duration_minutes: mins,
      });
      setBanIP('');
      setBanReason('');
      await loadBans();
    } catch (error) {
      setBanErr(error instanceof ApiError ? error.message : 'Failed to ban IP');
    } finally {
      setBanBusy(false);
    }
  }

  async function handleUnban(ip: string) {
    setBanErr('');
    try {
      await api.adminUnbanIP(ip);
      await loadBans();
    } catch (error) {
      setBanErr(error instanceof ApiError ? error.message : 'Failed to unban IP');
    }
  }

  function updateField<K extends keyof NetworkConfig>(key: K, value: NetworkConfig[K]) {
    setCfg((prev) => ({ ...prev, [key]: value }));
    if (saveState !== 'none') setSaveState('none');
    if (err) setErr('');
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setSaveState('none');

    if (cfg.edge_mode === 'acme' && !cfg.domain.trim()) {
      setErr('A domain name is required for Lune Built-in HTTPS.');
      return;
    }

    setSaving(true);
    try {
      const payload: NetworkConfig = {
        edge_mode: cfg.edge_mode,
        public_url: cfg.public_url.trim(),
        trusted_proxies: cfg.trusted_proxies.trim(),
        domain: cfg.domain.trim(),
        acme_email: cfg.acme_email.trim(),
        acme_staging: Boolean(cfg.acme_staging),
        acme_dns_provider: cfg.acme_dns_provider,
        cf_api_token: cfg.cf_api_token.trim(),
        admin_lan_only: Boolean(cfg.admin_lan_only),
        ip_allowlist: (cfg.ip_allowlist ?? '').trim(),
        ip_blocklist: (cfg.ip_blocklist ?? '').trim(),
      };
      const saved = normalizeNetworkConfig(await api.adminSaveNetworkConfig(payload));
      setCfg(saved);
      setSaveState(saved.restart_required ? 'restart' : 'live');
      onNetworkConfigChange?.(saved);
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Failed to save network settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl bg-surface border border-tone/[0.08] p-8 flex items-center justify-center gap-2 text-xs text-ink-secondary">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading network configuration…
      </div>
    );
  }

  const activeMode = cfg.active_edge_mode ? normalizeEdgeMode(cfg.active_edge_mode) : undefined;

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Pending restart notice on load (before user clicks Save again) */}
      {cfg.restart_required && saveState === 'none' && (
        <div className="rounded-xl bg-warning/10 border border-warning/30 px-4 py-3 text-xs text-warning flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Restart pending:</span> Lune is currently running in{' '}
            <span className="font-mono">{activeMode ?? 'local'}</span> mode. Restart your Lune
            container to switch to <span className="font-mono">{cfg.edge_mode}</span>.
          </div>
        </div>
      )}

      {/* Access Mode Selection Cards */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Access Mode</h2>
          <p className="text-xs text-ink-secondary mt-0.5">
            Choose how clients reach this Lune server and how TLS and forwarded headers are handled.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Access mode">
          {MODE_CARDS.map((card) => {
            const Icon = card.icon;
            const selected = cfg.edge_mode === card.id;
            const isRunning = activeMode === card.id;

            return (
              <button
                key={card.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => updateField('edge_mode', card.id)}
                className={`text-left rounded-xl p-4 border transition-colors cursor-pointer flex flex-col gap-2.5 ${
                  selected
                    ? 'bg-elevated border-accent/70 ring-1 ring-accent/30'
                    : 'bg-surface border-tone/[0.08] hover:border-tone/25 hover:bg-surface/90'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                        selected
                          ? 'bg-accent text-on-accent border-accent'
                          : 'bg-canvas text-ink-secondary border-hairline'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-ink">{card.title}</span>
                        {isRunning && (
                          <span className="px-1.5 py-0.5 rounded-full bg-healthy/15 text-healthy text-[10px] font-medium">
                            Active
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-ink-muted">{card.badge}</span>
                    </div>
                  </div>

                  <span
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                      selected
                        ? 'bg-accent border-accent text-on-accent'
                        : 'border-hairline bg-canvas'
                    }`}
                  >
                    {selected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </span>
                </div>

                <p className="text-xs leading-relaxed text-ink-secondary">{card.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode-Specific Configuration */}
      <div className="rounded-xl bg-surface border border-tone/[0.08] p-5 space-y-4">
        {cfg.edge_mode === 'acme' && (
          <>
            <div>
              <h3 className="text-sm font-semibold text-ink">Lune Built-in HTTPS (ACME)</h3>
              <p className="text-xs text-ink-secondary mt-0.5">
                Lune provisions and renews Let&apos;s Encrypt TLS certificates automatically.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="lune-net-domain"
                  className="block text-[11px] font-medium text-ink-secondary mb-1"
                >
                  Domain <span className="text-danger">*</span>
                </label>
                <input
                  id="lune-net-domain"
                  type="text"
                  required
                  value={cfg.domain}
                  onChange={(e) => updateField('domain', e.target.value)}
                  placeholder="lune.example.com"
                  className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
                />
              </div>

              <div>
                <label
                  htmlFor="lune-net-acme-email"
                  className="block text-[11px] font-medium text-ink-secondary mb-1"
                >
                  ACME Email <span className="text-ink-muted">(optional)</span>
                </label>
                <input
                  id="lune-net-acme-email"
                  type="email"
                  value={cfg.acme_email}
                  onChange={(e) => updateField('acme_email', e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
                />
                <p className="text-[11px] text-ink-muted mt-1">
                  Used by Let&apos;s Encrypt for certificate renewal notices.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="lune-net-dns-provider"
                  className="block text-[11px] font-medium text-ink-secondary mb-1"
                >
                  Challenge Method
                </label>
                <select
                  id="lune-net-dns-provider"
                  value={cfg.acme_dns_provider}
                  onChange={(e) =>
                    updateField('acme_dns_provider', e.target.value as '' | 'cloudflare')
                  }
                  className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs text-ink focus:outline-none focus:border-tone/50"
                >
                  <option value="">HTTP-01 / ALPN-01 (default)</option>
                  <option value="cloudflare">Cloudflare DNS-01 (no port 80 needed)</option>
                </select>
              </div>

              {cfg.acme_dns_provider === 'cloudflare' && (
                <div>
                  <label
                    htmlFor="lune-net-cf-token"
                    className="block text-[11px] font-medium text-ink-secondary mb-1"
                  >
                    Cloudflare API Token
                  </label>
                  <input
                    id="lune-net-cf-token"
                    type="password"
                    autoComplete="new-password"
                    value={cfg.cf_api_token}
                    onChange={(e) => updateField('cf_api_token', e.target.value)}
                    placeholder={
                      cfg.has_cf_api_token ? 'Saved (leave blank to keep)' : 'Zone:DNS:Edit token'
                    }
                    className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
                  />
                </div>
              )}
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-ink cursor-pointer select-none">
              <input
                type="checkbox"
                checked={cfg.acme_staging}
                onChange={(e) => updateField('acme_staging', e.target.checked)}
                className="accent-accent cursor-pointer"
              />
              Use Let&apos;s Encrypt Staging CA{' '}
              <span className="text-ink-muted">(for testing without rate limits)</span>
            </label>

            <div className="rounded-lg bg-canvas/70 border border-tone/[0.08] px-3.5 py-2.5 text-xs text-ink-secondary flex items-start gap-2.5">
              <Info className="w-4 h-4 text-telemetry shrink-0 mt-0.5" />
              <span>
                Ensure host ports <span className="font-mono text-ink">443</span> (and{' '}
                <span className="font-mono text-ink">80</span> unless using Cloudflare DNS-01) are
                mapped on your container, then restart Lune after saving.
              </span>
            </div>
          </>
        )}

        {cfg.edge_mode === 'proxy' && (
          <>
            <div>
              <h3 className="text-sm font-semibold text-ink">Reverse Proxy Configuration</h3>
              <p className="text-xs text-ink-secondary mt-0.5">
                Lune listens on HTTP port <span className="font-mono text-ink">5863</span> and
                honors <span className="font-mono text-ink">X-Forwarded-For</span> /{' '}
                <span className="font-mono text-ink">X-Forwarded-Proto</span> from trusted proxies.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="lune-net-proxy-url"
                  className="block text-[11px] font-medium text-ink-secondary mb-1"
                >
                  Public URL
                </label>
                <input
                  id="lune-net-proxy-url"
                  type="url"
                  value={cfg.public_url}
                  onChange={(e) => updateField('public_url', e.target.value)}
                  placeholder="https://lune.example.com"
                  className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
                />
                <p className="text-[11px] text-ink-muted mt-1">
                  Used for invite links and secure cookie settings when served over HTTPS.
                </p>
              </div>

              <div>
                <label
                  htmlFor="lune-net-trusted-proxies"
                  className="block text-[11px] font-medium text-ink-secondary mb-1"
                >
                  Trusted Reverse Proxies <span className="text-ink-muted">(optional CIDRs)</span>
                </label>
                <input
                  id="lune-net-trusted-proxies"
                  type="text"
                  value={cfg.trusted_proxies}
                  onChange={(e) => updateField('trusted_proxies', e.target.value)}
                  placeholder="10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16"
                  className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
                />
                <p className="text-[11px] text-ink-muted mt-1">
                  Leave blank to trust standard Docker/LAN subnets (
                  <span className="font-mono">10.0.0.0/8</span>,{' '}
                  <span className="font-mono">172.16.0.0/12</span>,{' '}
                  <span className="font-mono">192.168.0.0/16</span>, loopback).
                </p>
              </div>
            </div>
          </>
        )}

        {cfg.edge_mode === 'tailscale' && (
          <>
            <div>
              <h3 className="text-sm font-semibold text-ink">Tailscale Configuration</h3>
              <p className="text-xs text-ink-secondary mt-0.5">
                Serve Lune privately over your tailnet with automatic HTTPS and zero open firewall
                ports.
              </p>
            </div>

            <div>
              <label
                htmlFor="lune-net-ts-url"
                className="block text-[11px] font-medium text-ink-secondary mb-1"
              >
                Public URL
              </label>
              <input
                id="lune-net-ts-url"
                type="url"
                value={cfg.public_url}
                onChange={(e) => updateField('public_url', e.target.value)}
                placeholder="https://lune.your-tailnet.ts.net"
                className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
              />
              <p className="text-[11px] text-ink-muted mt-1">
                Used for invite links and secure cookies across your tailnet.
              </p>
            </div>

            <div className="rounded-lg bg-canvas/70 border border-tone/[0.08] px-3.5 py-2.5 text-xs text-ink-secondary flex items-start gap-2.5">
              <Info className="w-4 h-4 text-telemetry shrink-0 mt-0.5" />
              <span>
                Run{' '}
                <code className="font-mono text-ink bg-surface px-1.5 py-0.5 rounded border border-hairline">
                  tailscale serve --bg 5863
                </code>{' '}
                (or enable Tailscale in your container host, e.g. Unraid&apos;s{' '}
                <strong className="text-ink">Use Tailscale</strong> toggle). Lune automatically
                trusts loopback and Tailscale CGNAT{' '}
                <span className="font-mono text-ink">100.64.0.0/10</span>.
              </span>
            </div>
          </>
        )}

        {cfg.edge_mode === 'local' && (
          <div className="flex items-start gap-2.5 text-xs text-ink-secondary">
            <Info className="w-4 h-4 text-telemetry shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-ink">Entirely Local Mode</div>
              <p className="leading-relaxed">
                Lune serves plain HTTP directly on port{' '}
                <span className="font-mono text-ink">:5863</span> for local network access.
                Forwarded proxy headers are ignored unless explicitly configured, and no TLS
                certificates are requested.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Edge Security & Access Control (only relevant for internet-facing modes: acme & proxy) */}
      {(cfg.edge_mode === 'acme' || cfg.edge_mode === 'proxy') && (
        <div className="rounded-xl bg-surface border border-tone/[0.08] p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
              <Lock className="w-4 h-4 text-telemetry" />
              Edge Security &amp; Access Control
            </h3>
            <p className="text-xs text-ink-secondary mt-0.5">
              Hardening rules applied live at Lune&apos;s edge without restarting. Media streams and
              static assets remain unthrottled for maximum speed.
            </p>
          </div>

          <label className="flex items-start justify-between gap-4 rounded-lg bg-canvas/70 border border-tone/[0.08] p-3.5 cursor-pointer">
            <div>
              <div className="text-xs font-semibold text-ink">
                Restrict Admin Console to LAN / VPN Only
              </div>
              <div className="text-[11px] text-ink-muted mt-0.5 leading-relaxed">
                Block all <span className="font-mono">/api/v1/admin/*</span> requests from public IPs
                while keeping media streaming accessible over the internet. Loopback, RFC1918 LAN,
                Tailscale (<span className="font-mono">100.64.0.0/10</span>), and allowlisted CIDRs
                remain permitted.
              </div>
            </div>
            <input
              type="checkbox"
              checked={Boolean(cfg.admin_lan_only)}
              onChange={(e) => updateField('admin_lan_only', e.target.checked)}
              className="accent-accent w-4 h-4 mt-0.5 shrink-0 cursor-pointer"
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="lune-net-ip-allowlist"
                className="block text-[11px] font-medium text-ink-secondary mb-1"
              >
                IP Allowlist <span className="text-ink-muted">(optional CIDRs)</span>
              </label>
              <input
                id="lune-net-ip-allowlist"
                type="text"
                value={cfg.ip_allowlist ?? ''}
                onChange={(e) => updateField('ip_allowlist', e.target.value)}
                placeholder="203.0.113.5, 198.51.100.0/24"
                className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
              />
              <p className="text-[11px] text-ink-muted mt-1">
                Never rate-limited or auto-banned; also permitted when LAN-only Admin Console is on.
              </p>
            </div>

            <div>
              <label
                htmlFor="lune-net-ip-blocklist"
                className="block text-[11px] font-medium text-ink-secondary mb-1"
              >
                IP Blocklist <span className="text-ink-muted">(optional CIDRs)</span>
              </label>
              <input
                id="lune-net-ip-blocklist"
                type="text"
                value={cfg.ip_blocklist ?? ''}
                onChange={(e) => updateField('ip_blocklist', e.target.value)}
                placeholder="192.0.2.0/24"
                className="w-full rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
              />
              <p className="text-[11px] text-ink-muted mt-1">
                Immediately rejected with HTTP 403 at the edge.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Banners */}
      {err && (
        <div className="rounded-lg bg-danger/10 border border-danger/30 px-3.5 py-2.5 text-xs text-danger">
          {err}
        </div>
      )}

      {saveState === 'restart' && (
        <div className="rounded-lg bg-warning/10 border border-warning/30 px-3.5 py-2.5 text-xs text-warning flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Settings saved — restart your Lune container (with the required ports mapped) to activate
          this mode.
        </div>
      )}

      {saveState === 'live' && (
        <div className="rounded-lg bg-healthy/10 border border-healthy/30 px-3.5 py-2.5 text-xs text-healthy flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Settings saved and applied live — no restart required.
        </div>
      )}

      {/* Save Action */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent font-semibold text-xs px-4 py-2 transition-colors cursor-pointer"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Network Settings
        </button>
      </div>

      {/* Active IP Bans (Built-in Fail2ban) */}
      {(cfg.edge_mode === 'acme' || cfg.edge_mode === 'proxy' || bans.length > 0) && (
        <div className="rounded-xl bg-surface border border-tone/[0.08] p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Ban className="w-4 h-4 text-danger" />
            Active IP Bans
          </h3>
          <p className="text-xs text-ink-secondary mt-0.5">
            Lune automatically bans IPs that repeatedly fail login lockouts, forge stream tokens, or
            probe API endpoints. You can also ban or unban IPs manually below.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input
            type="text"
            value={banIP}
            onChange={(e) => setBanIP(e.target.value)}
            placeholder="IP address (e.g. 203.0.113.42)"
            className="sm:col-span-4 rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
          />
          <input
            type="text"
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            placeholder="Reason (optional)"
            className="sm:col-span-4 rounded-lg bg-canvas border border-hairline px-3 py-2 text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
          />
          <select
            value={banMinutes}
            onChange={(e) => setBanMinutes(e.target.value)}
            className="sm:col-span-2 rounded-lg bg-canvas border border-hairline px-2.5 py-2 text-base sm:text-xs text-ink focus:outline-none focus:border-tone/50"
          >
            <option value="15">15 min</option>
            <option value="60">1 hour</option>
            <option value="1440">24 hours</option>
            <option value="0">Permanent</option>
          </select>
          <button
            type="button"
            disabled={banBusy || !banIP.trim()}
            onClick={handleManualBan}
            className="sm:col-span-2 rounded-lg bg-danger/15 hover:bg-danger/25 border border-danger/30 text-danger font-semibold text-xs px-3 py-2 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {banBusy ? 'Banning…' : 'Ban IP'}
          </button>
        </div>

        {banErr && (
          <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">
            {banErr}
          </div>
        )}

        {bans.length === 0 ? (
          <div className="rounded-lg bg-canvas/60 border border-tone/[0.06] px-4 py-5 text-center text-xs text-ink-muted">
            No active IP bans.
          </div>
        ) : (
          <div className="divide-y divide-tone/[0.06] rounded-lg border border-tone/[0.08] overflow-hidden">
            {bans.map((b) => (
              <div
                key={b.ip}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-canvas/60 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-ink">{b.ip}</span>
                    <span className="px-1.5 py-0.5 rounded bg-danger/15 text-danger text-[10px] font-medium">
                      {b.permanent ? 'Permanent' : 'Temporary'}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-muted mt-0.5 truncate">
                    {b.reason}
                    {b.expires_at ? ` · expires ${new Date(b.expires_at).toLocaleString()}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnban(b.ip)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-elevated hover:bg-hairline text-xs text-ink-secondary hover:text-ink transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Unban
                </button>
              </div>
            ))}
          </div>
        )}
        </div>
      )}
    </form>
  );
}
