import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FolderPlus, RefreshCw, Trash2 } from 'lucide-react';
import { api, ApiError, scanPercent, type Library } from '../../lib/api';

interface Props {
  libraries: Library[];
  onLibrariesChanged: () => void;
  onRefreshTelemetry: () => void;
}

export function ConsoleLibraries({ libraries, onLibrariesChanged, onRefreshTelemetry }: Props) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Library['kind']>('movies');
  const [rootPath, setRootPath] = useState('');
  const [formErr, setFormErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyID, setBusyID] = useState('');
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());

  const hasRunningScan = libraries.some((l) => l.scan?.running);
  const onLibrariesChangedRef = useRef(onLibrariesChanged);
  onLibrariesChangedRef.current = onLibrariesChanged;

  useEffect(() => {
    if (!hasRunningScan) return;
    const timer = window.setInterval(() => {
      onLibrariesChangedRef.current();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [hasRunningScan]);

  // Scans started from this page run asynchronously; once the polled status
  // reports one finished, auto-expand its error panel if it reported errors.
  const watchedScansRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const watched = watchedScansRef.current;
    if (watched.size === 0) return;
    for (const lib of libraries) {
      if (!watched.has(lib.id) || !lib.scan || lib.scan.running) continue;
      watched.delete(lib.id);
      if (lib.scan.errors > 0) {
        setExpandedErrors((prev) => new Set(prev).add(lib.id));
      }
    }
  }, [libraries]);

  // Start a scan without waiting for it to finish, then refetch libraries
  // straight away so the "scanning" pill shows and status polling starts.
  async function startScan(id: string, force: boolean) {
    try {
      const st = await api.scanLibrary(id, false, force);
      if (st.running) watchedScansRef.current.add(id);
    } catch (err) {
      // A scan already in progress is fine: refetching surfaces its status.
      if (!(err instanceof ApiError)) throw err;
    }
    onLibrariesChanged();
    onRefreshTelemetry();
  }

  function toggleErrors(id: string) {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAddLibrary(e: FormEvent) {
    e.preventDefault();
    if (creating) return;
    setFormErr('');
    setCreating(true);
    let lib: Library;
    try {
      lib = await api.createLibrary({ name, kind, root_path: rootPath });
      setName('');
      setRootPath('');
      onLibrariesChanged();
      onRefreshTelemetry();
    } catch (err) {
      setFormErr(err instanceof ApiError ? err.message : 'Failed to register library');
      return;
    } finally {
      setCreating(false);
    }

    setBusyID(lib.id);
    try {
      await startScan(lib.id, false).catch(() => undefined);
    } finally {
      setBusyID('');
    }
  }

  async function handleScan(id: string, force = false) {
    setBusyID(id);
    try {
      await startScan(id, force);
    } finally {
      setBusyID('');
    }
  }

  async function handleDeleteLibrary(id: string) {
    setBusyID(id);
    try {
      await api.deleteLibrary(id);
      onLibrariesChanged();
      onRefreshTelemetry();
    } finally {
      setBusyID('');
    }
  }

  return (
    <div className="rounded-xl bg-surface border border-tone/[0.08] p-5 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-ink">Media Libraries</h2>
        <p className="text-xs text-ink-secondary mt-0.5">
          Mounted directories are watched automatically for new files and rescanned periodically.
        </p>
      </div>

      <form onSubmit={handleAddLibrary} className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <input
          type="text"
          required
          placeholder={
            kind === 'anime'
              ? 'Library name (e.g. Anime)'
              : kind === 'shows'
                ? 'Library name (e.g. TV Shows)'
                : kind === 'music'
                  ? 'Library name (e.g. Music)'
                  : 'Library name (e.g. Movies)'
          }
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="md:col-span-3 rounded-lg bg-canvas border border-hairline px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as Library['kind'])}
          className="md:col-span-2 rounded-lg bg-canvas border border-hairline px-3 py-2 text-sm text-ink focus:outline-none focus:border-tone/50"
        >
          <option value="movies">Movies</option>
          <option value="shows">TV Shows</option>
          <option value="anime">Anime</option>
          <option value="music">Music</option>
          <option value="other">Other</option>
        </select>
        <input
          type="text"
          required
          placeholder={`/media/${kind}`}
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          className="md:col-span-5 rounded-lg bg-canvas border border-hairline px-3 py-2 text-sm font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-tone/50"
        />
        <button
          type="submit"
          disabled={creating}
          className="md:col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:pointer-events-none text-on-accent font-semibold text-sm px-3 py-2 transition-colors cursor-pointer"
        >
          <FolderPlus className="w-4 h-4" />
          {creating ? 'Adding…' : 'Add & Scan'}
        </button>
      </form>

      {formErr && (
        <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">
          {formErr}
        </div>
      )}

      <div className="divide-y divide-tone/[0.08]">
        {libraries.length === 0 ? (
          <p className="text-xs text-ink-muted py-4">No libraries configured yet.</p>
        ) : (
          libraries.map((lib) => {
            const scanning = !!lib.scan?.running;
            const pct = scanPercent(lib.scan);
            return (
            <div key={lib.id} className="py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-ink">{lib.name}</span>
                  <span className="px-2 py-0.5 rounded-full bg-elevated text-[10px] font-medium uppercase tracking-wide text-ink">
                    {lib.kind}
                  </span>
                  <span className="text-xs tabular-nums text-ink-secondary">{lib.item_count} items</span>
                  {lib.scan?.running && (
                    <span className="px-2 py-0.5 rounded-full bg-telemetry/15 text-[10px] font-medium tabular-nums text-telemetry">
                      {pct === null ? 'scanning' : `scanning ${pct}%`}
                    </span>
                  )}
                  {lib.scan && lib.scan.errors > 0 && (
                    <button
                      type="button"
                      title="Show scan error details"
                      onClick={() => toggleErrors(lib.id)}
                      className="px-2 py-0.5 rounded-full bg-warning/15 hover:bg-warning/25 text-[10px] font-medium tabular-nums text-warning transition-colors cursor-pointer"
                    >
                      {lib.scan.errors} {lib.scan.errors === 1 ? 'error' : 'errors'}
                      {expandedErrors.has(lib.id) ? ' ▴' : ' ▾'}
                    </button>
                  )}
                </div>
                <div className="text-xs font-mono text-ink-muted truncate mt-0.5">{lib.root_path}</div>
                {lib.scan && lib.scan.errors > 0 && lib.scan.last_error && !expandedErrors.has(lib.id) && (
                  <button
                    type="button"
                    onClick={() => toggleErrors(lib.id)}
                    className="mt-1 block max-w-full text-left text-[11px] font-mono text-danger hover:underline truncate cursor-pointer"
                  >
                    {lib.scan.last_error}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busyID === lib.id || scanning}
                  onClick={() => handleScan(lib.id, false)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-elevated hover:bg-hairline text-xs font-medium text-ink px-3 py-1.5 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${busyID === lib.id || scanning ? 'animate-spin' : ''}`}
                  />
                  {scanning ? (pct === null ? 'Scanning…' : `Scanning… ${pct}%`) : 'Scan'}
                </button>
                <button
                  type="button"
                  title="Re-probe and refresh metadata for all items in this library"
                  disabled={busyID === lib.id || scanning}
                  onClick={() => handleScan(lib.id, true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-canvas border border-hairline hover:border-accent/60 text-xs font-medium text-ink px-3 py-1.5 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Refresh Metadata
                </button>
                <button
                  type="button"
                  disabled={busyID === lib.id}
                  onClick={() => handleDeleteLibrary(lib.id)}
                  className="p-1.5 rounded-lg text-ink-secondary hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {scanning && (
                <div
                  className="basis-full h-1 rounded-full bg-elevated overflow-hidden"
                  role="progressbar"
                  aria-label={`Scanning ${lib.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct ?? undefined}
                >
                  <div
                    className={`h-full rounded-full bg-telemetry ${
                      pct === null ? 'w-1/3 animate-pulse' : 'transition-[width] duration-500'
                    }`}
                    style={pct === null ? undefined : { width: `${pct}%` }}
                  />
                </div>
              )}

              {lib.scan && lib.scan.errors > 0 && expandedErrors.has(lib.id) && (
                <div className="basis-full rounded-lg bg-canvas border border-warning/25 p-3 space-y-2">
                  <div className="text-xs font-medium text-warning">
                    {lib.scan.errors} {lib.scan.errors === 1 ? 'file' : 'files'} failed to probe or index during the last scan
                  </div>
                  {lib.scan.error_samples && lib.scan.error_samples.length > 0 ? (
                    <ul className="space-y-1.5">
                      {lib.scan.error_samples.map((e, i) => (
                        <li key={i} className="text-[11px] font-mono leading-relaxed">
                          {e.path && <div className="text-ink-secondary break-all">{e.path}</div>}
                          <div className="text-danger break-words">{e.message}</div>
                        </li>
                      ))}
                    </ul>
                  ) : lib.scan.last_error ? (
                    <div className="text-[11px] font-mono text-danger break-words">{lib.scan.last_error}</div>
                  ) : (
                    <div className="text-[11px] text-ink-secondary">
                      No error details were recorded (the scan ran on an older server build). Run Scan again to capture them.
                    </div>
                  )}
                  {lib.scan.error_samples && lib.scan.errors > lib.scan.error_samples.length && (
                    <div className="text-[11px] text-ink-muted">
                      Showing first {lib.scan.error_samples.length} of {lib.scan.errors}. See server logs for the rest.
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
