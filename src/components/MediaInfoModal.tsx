import { useEffect, useState } from 'react';
import { Check, Copy, Film, HardDrive, Subtitles, Volume2, X } from 'lucide-react';
import { formatBytes, formatDuration, type MediaItemDetail } from '../lib/api';
import { useBodyScrollLock } from '../lib/useBodyScrollLock';

interface Props {
  detail: MediaItemDetail;
  onClose: () => void;
}

export function MediaInfoModal({ detail, onClose }: Props) {
  useBodyScrollLock(true);
  const [copiedPath, setCopiedPath] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const videoStreams = detail.streams.filter((s) => s.type === 'video');
  const audioStreams = detail.streams.filter((s) => s.type === 'audio');
  const embeddedSubStreams = detail.streams.filter((s) => s.type === 'subtitle');
  const sidecarSubs = (detail.subtitles ?? []).filter((s) => s.source === 'sidecar');

  async function copyPath() {
    if (!detail.file_path) return;
    try {
      await navigator.clipboard.writeText(detail.file_path);
      setCopiedPath(true);
      window.setTimeout(() => setCopiedPath(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-surface/92 backdrop-blur-xl backdrop-saturate-150 border border-tone/12 shadow-2xl p-6 space-y-5"
      >
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-tone/[0.08]">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              Media Info
            </div>
            <h2 className="text-base font-semibold text-ink truncate mt-0.5">{detail.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Media Info"
            className="p-1.5 rounded-lg text-ink-secondary hover:text-ink hover:bg-elevated transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* File & Container Summary */}
        <div
          className={`grid grid-cols-2 ${detail.release_group ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-3`}
        >
          <div className="rounded-xl bg-canvas/70 border border-tone/[0.08] p-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-muted">Container</div>
            <div className="text-xs font-semibold text-ink tabular-nums mt-0.5">
              {detail.container ? detail.container.toUpperCase() : '—'}
            </div>
          </div>
          <div className="rounded-xl bg-canvas/70 border border-tone/[0.08] p-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-muted">File Size</div>
            <div className="text-xs font-semibold text-ink tabular-nums mt-0.5">
              {detail.file_size > 0 ? formatBytes(detail.file_size) : '—'}
            </div>
          </div>
          <div className="rounded-xl bg-canvas/70 border border-tone/[0.08] p-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-muted">Bitrate</div>
            <div className="text-xs font-semibold text-ink tabular-nums mt-0.5">
              {detail.bitrate > 0 ? `${(detail.bitrate / 1_000_000).toFixed(1)} Mbps` : '—'}
            </div>
          </div>
          <div className="rounded-xl bg-canvas/70 border border-tone/[0.08] p-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-muted">Runtime</div>
            <div className="text-xs font-semibold text-ink tabular-nums mt-0.5">
              {detail.duration_ms > 0 ? formatDuration(detail.duration_ms) : '—'}
            </div>
          </div>
          {detail.release_group && (
            <div className="rounded-xl bg-canvas/70 border border-tone/[0.08] p-3 col-span-2 sm:col-span-1">
              <div className="text-[10px] uppercase tracking-wider text-ink-muted">Release Group</div>
              <div
                title={detail.release_group}
                className="text-xs font-semibold text-ink tabular-nums mt-0.5 truncate"
              >
                {detail.release_group}
              </div>
            </div>
          )}
        </div>

        {detail.file_path && (
          <div className="rounded-xl bg-canvas/70 border border-tone/[0.08] p-3.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                <HardDrive className="w-3 h-3" />
                File Path
              </div>
              <button
                type="button"
                onClick={copyPath}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-secondary hover:text-ink transition-colors cursor-pointer"
              >
                {copiedPath ? <Check className="w-3 h-3 text-healthy" /> : <Copy className="w-3 h-3" />}
                {copiedPath ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="font-mono text-[11px] text-ink-secondary break-all leading-relaxed">
              {detail.file_path}
            </div>
          </div>
        )}

        {/* Video Streams */}
        {videoStreams.length > 0 && (
          <section className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              <Film className="w-3.5 h-3.5 text-telemetry" />
              Video ({videoStreams.length})
            </div>
            <div className="space-y-1.5">
              {videoStreams.map((st) => (
                <div
                  key={st.index}
                  className="rounded-xl bg-canvas/70 border border-tone/[0.08] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums"
                >
                  <div className="font-medium text-ink">
                    {st.codec.toUpperCase()}
                    {st.profile ? ` · ${st.profile}` : ''}
                    {st.width && st.height ? ` · ${st.width}×${st.height}` : ''}
                    {st.hdr && st.hdr !== 'sdr' ? ` · ${st.hdr.toUpperCase()}` : ''}
                  </div>
                  <div className="text-[11px] text-ink-muted">
                    Stream #{st.index}
                    {st.title ? ` · ${st.title}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Audio Streams */}
        {audioStreams.length > 0 && (
          <section className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              <Volume2 className="w-3.5 h-3.5 text-ink" />
              Audio ({audioStreams.length})
            </div>
            <div className="space-y-1.5">
              {audioStreams.map((st) => (
                <div
                  key={st.index}
                  className="rounded-xl bg-canvas/70 border border-tone/[0.08] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums"
                >
                  <div className="font-medium text-ink flex items-center gap-2 flex-wrap">
                    <span>
                      {(st.language || 'Unknown').toUpperCase()} · {st.codec.toUpperCase()}
                      {st.channel_layout
                        ? ` · ${st.channel_layout}`
                        : st.channels
                          ? ` · ${st.channels}ch`
                          : ''}
                    </span>
                    {st.default && (
                      <span className="px-1.5 py-0.5 rounded bg-tone/10 text-[10px] font-medium text-ink-secondary">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-muted">
                    Stream #{st.index}
                    {st.title ? ` · ${st.title}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Subtitles (Sidecar + Embedded) */}
        {(sidecarSubs.length > 0 || embeddedSubStreams.length > 0) && (
          <section className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              <Subtitles className="w-3.5 h-3.5 text-ink-secondary" />
              Subtitles ({sidecarSubs.length + embeddedSubStreams.length})
            </div>
            <div className="space-y-1.5">
              {sidecarSubs.map((sub) => (
                <div
                  key={`sidecar-${sub.index}`}
                  className="rounded-xl bg-canvas/70 border border-tone/[0.08] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums"
                >
                  <div className="font-medium text-ink flex items-center gap-2 flex-wrap">
                    <span>{sub.label}</span>
                    <span className="px-1.5 py-0.5 rounded bg-tone/10 text-[10px] font-medium uppercase text-ink-secondary">
                      Sidecar {sub.format ? `· ${sub.format}` : ''}
                    </span>
                    {sub.forced && (
                      <span className="px-1.5 py-0.5 rounded bg-telemetry/15 text-[10px] font-medium text-telemetry">
                        Forced
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-muted uppercase">{sub.language}</div>
                </div>
              ))}
              {embeddedSubStreams.map((st) => (
                <div
                  key={`emb-${st.index}`}
                  className="rounded-xl bg-canvas/70 border border-tone/[0.08] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums"
                >
                  <div className="font-medium text-ink flex items-center gap-2 flex-wrap">
                    <span>
                      {(st.language || 'Unknown').toUpperCase()} · {st.codec.toUpperCase()}
                      {st.title ? ` · ${st.title}` : ''}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-tone/10 text-[10px] font-medium uppercase text-ink-secondary">
                      Embedded
                    </span>
                    {st.forced && (
                      <span className="px-1.5 py-0.5 rounded bg-telemetry/15 text-[10px] font-medium text-telemetry">
                        Forced
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-muted">Stream #{st.index}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
