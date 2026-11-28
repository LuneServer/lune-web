// Cross-browser fullscreen helpers (standard, webkit-prefixed, and iPhone native video fullscreen).

export interface WebkitFullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

export interface WebkitFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

export interface WebkitFullscreenVideo extends HTMLVideoElement {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
  webkitSupportsFullscreen?: boolean;
}

type LockableOrientation = ScreenOrientation & {
  lock?: (o: 'landscape') => Promise<void>;
  unlock?: () => void;
};

export function getFullscreenElement(): Element | null {
  const d = document as WebkitFullscreenDocument;
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

export function isNativeVideoFullscreen(video: HTMLVideoElement | null): boolean {
  return Boolean(video && (video as WebkitFullscreenVideo).webkitDisplayingFullscreen);
}

function swallow(r: Promise<void> | void): void {
  if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
}

export function exitAnyFullscreen(video: HTMLVideoElement | null): void {
  const d = document as WebkitFullscreenDocument;
  try {
    if (document.fullscreenElement) {
      swallow(document.exitFullscreen());
    } else if (d.webkitFullscreenElement && d.webkitExitFullscreen) {
      swallow(d.webkitExitFullscreen());
    } else if (video && isNativeVideoFullscreen(video)) {
      (video as WebkitFullscreenVideo).webkitExitFullscreen?.();
    }
  } catch {
    // ignore
  }
  unlockOrientation();
}

/**
 * Enter fullscreen using the best available API. Must be called synchronously from a user gesture.
 * Order: standard container -> webkit container -> iPhone native video player.
 */
export function enterFullscreen(container: HTMLElement | null, video: HTMLVideoElement | null): void {
  const el = container as WebkitFullscreenElement | null;
  const v = video as WebkitFullscreenVideo | null;
  try {
    if (el && typeof el.requestFullscreen === 'function') {
      el.requestFullscreen().then(lockLandscape, () => {
        // Container fullscreen refused: fall back to the native video player where available.
        try {
          v?.webkitEnterFullscreen?.();
        } catch {
          // ignore
        }
      });
      return;
    }
    if (el && typeof el.webkitRequestFullscreen === 'function') {
      swallow(el.webkitRequestFullscreen());
      lockLandscape();
      return;
    }
    if (v && typeof v.webkitEnterFullscreen === 'function') {
      v.webkitEnterFullscreen();
    }
  } catch {
    // ignore
  }
}

function lockLandscape(): void {
  try {
    const o = screen.orientation as LockableOrientation | undefined;
    o?.lock?.('landscape')?.catch(() => {});
  } catch {
    // ignore
  }
}

export function unlockOrientation(): void {
  try {
    (screen.orientation as LockableOrientation | undefined)?.unlock?.();
  } catch {
    // ignore
  }
}
