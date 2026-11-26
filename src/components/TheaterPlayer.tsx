import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Hls from 'hls.js';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipForward,
  Volume2,
  VolumeX,
  Subtitles,
  Settings,
  Maximize,
  Minimize,
  PictureInPicture2,
  Info,
  Check,
  Radio,
  FastForward,
  Languages,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  api,
  normalizeLangCode,
  type MediaItemDetail,
  type MediaItemSummary,
  type PlaybackLaunchOptions,
  type PlaybackOptions,
  type PlaybackPlan,
  type SubtitleStream,
  type UserPreferences,
} from '../lib/api';
import { useBodyScrollLock } from '../lib/useBodyScrollLock';

interface Props {
  itemId: string;
  initialItem?: MediaItemSummary;
  launchOptions?: PlaybackLaunchOptions;
  userPreferences?: UserPreferences;
  onClose: () => void;
  onSelectItem: (next: MediaItemSummary) => void;
  onProgressUpdated: () => void;
}

interface Cue {
  start: number;
  end: number;
  text: string;
}

type QualityPreset = {
  id: string;
  label: string;
  minSourceWidth?: number;
  minSourceHeight?: number;
  maxBitrate?: number;
  maxHeight?: number;
  forceTranscode?: boolean;
};

const QUALITY_PRESETS: QualityPreset[] = [
  { id: 'original', label: 'Original (Auto)' },
  { id: '4k-40', label: '4K · 40 Mbps', minSourceWidth: 3200, minSourceHeight: 1800, maxBitrate: 40_000_000, maxHeight: 2160, forceTranscode: true },
  { id: '1080p-20', label: '1080p · 20 Mbps', minSourceWidth: 1800, minSourceHeight: 1000, maxBitrate: 20_000_000, maxHeight: 1080, forceTranscode: true },
  { id: '1080p-10', label: '1080p · 10 Mbps', minSourceWidth: 1800, minSourceHeight: 1000, maxBitrate: 10_000_000, maxHeight: 1080, forceTranscode: true },
  { id: '720p', label: '720p · 4 Mbps', minSourceWidth: 1200, minSourceHeight: 680, maxBitrate: 4_000_000, maxHeight: 720, forceTranscode: true },
  { id: '480p', label: '480p · 1.5 Mbps', maxBitrate: 1_500_000, maxHeight: 480, forceTranscode: true },
];

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const LS_VOLUME = 'lune_player_volume';
const LS_MUTED = 'lune_player_muted';
const LS_SUB_SIZE = 'lune_player_sub_size';

function readStoredVolume(): number {
  try {
    const raw = localStorage.getItem(LS_VOLUME);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
    }
  } catch {
    // ignore
  }
  return 1;
}

function readStoredMuted(): boolean {
  try {
    return localStorage.getItem(LS_MUTED) === '1';
  } catch {
    return false;
  }
}

function readStoredSubSize(): 'sm' | 'md' | 'lg' {
  try {
    const raw = localStorage.getItem(LS_SUB_SIZE);
    if (raw === 'sm' || raw === 'md' || raw === 'lg') return raw;
  } catch {
    // ignore
  }
  return 'md';
}

export function TheaterPlayer({
  itemId,
  initialItem,
  launchOptions,
  userPreferences,
  onClose,
  onSelectItem,
  onProgressUpdated,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scrubberRef = useRef<HTMLDivElement | null>(null);
  useBodyScrollLock(true);

  const hideTimerRef = useRef<number | null>(null);
  const planRef = useRef<PlaybackPlan | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const nextItemRef = useRef<MediaItemSummary | null>(null);
  const upNextDismissedRef = useRef(false);
  const onProgressUpdatedRef = useRef(onProgressUpdated);
  const userPreferencesRef = useRef(userPreferences);
  const directFallbackUsedRef = useRef(false);
  const draggingRef = useRef(false);
  const negotiateSeqRef = useRef(0);
  const shouldAutoPlayRef = useRef(true);
  const seekDebounceRef = useRef<number | null>(null);
  const renegotiatingRef = useRef(false);
  const hlsRef = useRef<Hls | null>(null);

  const [detail, setDetail] = useState<MediaItemDetail | null>(null);
  const [nextItem, setNextItem] = useState<MediaItemSummary | null>(null);
  const activeItem = detail ?? initialItem;
  const [plan, setPlan] = useState<PlaybackPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState('');
  const [playerEngine, setPlayerEngine] = useState<'native' | 'hls.js' | 'safari-hls'>('native');
  const [decodedResolution, setDecodedResolution] = useState<{ width: number; height: number } | null>(null);
  const [directFallbackReason, setDirectFallbackReason] = useState('');

  // Transport state (currentTime & bufferedEnd are always in ABSOLUTE media seconds)
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState<number>(readStoredVolume);
  const [muted, setMuted] = useState<boolean>(readStoredMuted);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const pipTrackRef = useRef<TextTrack | null>(null);
  const [scrubPreviewSec, setScrubPreviewSec] = useState<number | null>(null);
  const [scrubPreviewPct, setScrubPreviewPct] = useState(0);
  const [droppedFrames, setDroppedFrames] = useState(0);

  // Modifiable playback settings
  const [qualityId, setQualityId] = useState('original');
  const [selectedAudioIdx, setSelectedAudioIdx] = useState<number | undefined>(undefined);
  const [burnSubStreamIdx, setBurnSubStreamIdx] = useState<number | undefined>(undefined);

  // Modifiable subtitle settings
  const [selectedSubIdx, setSelectedSubIdx] = useState<number | null>(null);
  const [subCues, setSubCues] = useState<Cue[]>([]);
  const [subStatus, setSubStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [subRetryNonce, setSubRetryNonce] = useState(0);
  const [subSize, setSubSize] = useState<'sm' | 'md' | 'lg'>(readStoredSubSize);
  const [subOffsetSec, setSubOffsetSec] = useState(0);
  const subTrackKeyRef = useRef<string>('');
  const subStreamStartRef = useRef<number>(0);
  const subStreamCompleteRef = useRef<boolean>(false);
  const subMaxEndRef = useRef<number>(0);
  const subAbortRef = useRef<AbortController | null>(null);
  const subStreamGenRef = useRef<number>(0);

  // OSD & popovers
  const [osdVisible, setOsdVisible] = useState(true);
  const [openMenu, setOpenMenu] = useState<'none' | 'subtitles' | 'settings'>('none');
  const [showStats, setShowStats] = useState(false);

  // Up Next auto-advance
  const [upNextCountdown, setUpNextCountdown] = useState<number | null>(null);
  const [upNextDismissed, setUpNextDismissed] = useState(false);

  // Keep refs fresh without triggering video/HLS teardown
  planRef.current = plan;
  currentTimeRef.current = currentTime;
  nextItemRef.current = nextItem;
  upNextDismissedRef.current = upNextDismissed;
  onProgressUpdatedRef.current = onProgressUpdated;
  userPreferencesRef.current = userPreferences;

  // For HLS remux/transcode sessions started at -ss, FFmpeg outputs timestamps starting at 0.
  // Adding streamOffsetSec converts local <video>.currentTime to true absolute media position.
  const streamOffsetSec = plan && plan.mode !== 'direct' ? plan.resume_position_ms / 1000 : 0;

  const duration = useMemo(() => {
    const knownMs = plan?.duration_ms || detail?.duration_ms || initialItem?.duration_ms || 0;
    if (knownMs > 0) return knownMs / 1000;
    return mediaDuration;
  }, [plan?.duration_ms, detail?.duration_ms, initialItem?.duration_ms, mediaDuration]);
  durationRef.current = duration;

  const availablePresets = useMemo(() => {
    const srcW = detail?.video_width || initialItem?.video_width || 0;
    const srcH = detail?.video_height || initialItem?.video_height || 0;
    if (!srcW && !srcH) return QUALITY_PRESETS;
    return QUALITY_PRESETS.filter(
      (p) =>
        (!p.minSourceWidth && !p.minSourceHeight) ||
        (p.minSourceWidth && srcW >= p.minSourceWidth) ||
        (p.minSourceHeight && srcH >= p.minSourceHeight),
    );
  }, [detail?.video_width, detail?.video_height, initialItem?.video_width, initialItem?.video_height]);

  const teardownActiveStream = useCallback(() => {
    const h = hlsRef.current;
    if (h) {
      hlsRef.current = null;
      h.destroy();
    }
    const v = videoRef.current;
    if (v) {
      v.pause();
      if (!h && planRef.current && planRef.current.mode !== 'direct') {
        v.removeAttribute('src');
        v.load();
      }
    }
  }, []);

  const stopActiveSession = useCallback(() => {
    const sid = activeSessionIdRef.current ?? planRef.current?.session_id ?? null;
    if (!sid) return;
    activeSessionIdRef.current = null;
    api.stopPlaybackSession(sid).catch(() => {});
  }, []);

  const negotiate = useCallback(
    async (opts?: PlaybackOptions, isInitial = false, initialSubOverride?: number | null) => {
      if (seekDebounceRef.current !== null) {
        window.clearTimeout(seekDebounceRef.current);
        seekDebounceRef.current = null;
      }
      const seq = ++negotiateSeqRef.current;
      renegotiatingRef.current = !isInitial;
      setLoading(true);
      setError('');
      try {
        teardownActiveStream();
        stopActiveSession();
        const p = await api.negotiatePlayback(itemId, opts);
        if (!mountedRef.current || seq !== negotiateSeqRef.current) {
          // Component unmounted or superseded by a newer seek/quality/audio negotiation; stop immediately.
          api.stopPlaybackSession(p.session_id).catch(() => {});
          return;
        }
        activeSessionIdRef.current = p.session_id;
        setPlan(p);
        if (p.mode !== 'direct') {
          const resumeSec = p.resume_position_ms / 1000;
          currentTimeRef.current = resumeSec;
          setCurrentTime(resumeSec);
          setBufferedEnd(resumeSec);
        }
        if (isInitial) {
          if (opts?.audio_stream_index !== undefined) {
            setSelectedAudioIdx(opts.audio_stream_index);
          } else if (p.selected_audio_index !== undefined) {
            setSelectedAudioIdx(p.selected_audio_index);
          }
          if (initialSubOverride !== undefined) {
            setSelectedSubIdx(initialSubOverride);
          } else if (p.selected_subtitle_index !== undefined) {
            setSelectedSubIdx(p.selected_subtitle_index);
          } else {
            const forced = (p.subtitles ?? []).find((s) => s.forced && !s.requires_burn_in);
            setSelectedSubIdx(forced ? forced.index : null);
          }
          setBurnSubStreamIdx(p.burn_subtitle_stream_index);
        }
      } catch (err) {
        if (mountedRef.current && seq === negotiateSeqRef.current) {
          setBuffering(false);
          setError(err instanceof Error ? err.message : 'Unable to start stream');
        }
      } finally {
        if (mountedRef.current && seq === negotiateSeqRef.current) {
          setLoading(false);
          renegotiatingRef.current = false;
        }
      }
    },
    [itemId, stopActiveSession, teardownActiveStream],
  );

  const buildCurrentOpts = useCallback(
    (overrides?: Partial<PlaybackOptions>): PlaybackOptions => {
      const preset = QUALITY_PRESETS.find((p) => p.id === qualityId) ?? QUALITY_PRESETS[0];
      return {
        max_bitrate: preset.maxBitrate,
        max_height: preset.maxHeight,
        force_transcode: preset.forceTranscode,
        audio_stream_index: selectedAudioIdx,
        burn_subtitle_stream_index: burnSubStreamIdx,
        ...overrides,
      };
    },
    [qualityId, selectedAudioIdx, burnSubStreamIdx],
  );

  // Initial load on item change
  useEffect(() => {
    directFallbackUsedRef.current = false;
    shouldAutoPlayRef.current = true;
    setDirectFallbackReason('');
    setDecodedResolution(null);
    setDetail(null);
    setNextItem(null);
    setPlan(null);
    setQualityId('original');
    setSelectedAudioIdx(launchOptions?.audioStreamIndex);
    setBurnSubStreamIdx(launchOptions?.burnSubtitleStreamIndex);
    setSelectedSubIdx(
      launchOptions?.subtitleIndex !== undefined ? launchOptions.subtitleIndex : null,
    );
    setSubCues([]);
    setSubOffsetSec(0);
    setOpenMenu('none');
    setUpNextCountdown(null);
    setUpNextDismissed(false);
    setCurrentTime(0);
    setMediaDuration(0);
    setBufferedEnd(0);
    setBuffering(false);
    setDroppedFrames(0);

    let active = true;
    api
      .getItem(itemId)
      .then((d) => {
        if (!active) return;
        setDetail(d);
        if (d.kind === 'episode') {
          api
            .getNextEpisode(itemId)
            .then((res) => {
              if (active) setNextItem(res.next_item ?? null);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    const initialOpts: PlaybackOptions | undefined =
      launchOptions &&
      (launchOptions.audioStreamIndex !== undefined ||
        launchOptions.burnSubtitleStreamIndex !== undefined ||
        launchOptions.startPositionMS !== undefined)
        ? {
            ...(launchOptions.audioStreamIndex !== undefined
              ? { audio_stream_index: launchOptions.audioStreamIndex }
              : {}),
            ...(launchOptions.burnSubtitleStreamIndex !== undefined
              ? { burn_subtitle_stream_index: launchOptions.burnSubtitleStreamIndex }
              : {}),
            ...(launchOptions.startPositionMS !== undefined
              ? { start_position_ms: launchOptions.startPositionMS }
              : {}),
          }
        : undefined;
    negotiate(initialOpts, true, launchOptions?.subtitleIndex);
    return () => {
      active = false;
    };
  }, [
    itemId,
    launchOptions?.audioStreamIndex,
    launchOptions?.subtitleIndex,
    launchOptions?.burnSubtitleStreamIndex,
    launchOptions?.startPositionMS,
    negotiate,
  ]);

  // Attach media stream ONLY when plan or item changes (never on nextItem/upNextDismissed updates!)
  useEffect(() => {
    if (!plan || !videoRef.current) return;
    const video = videoRef.current;
    const offsetSec = plan.mode !== 'direct' ? plan.resume_position_ms / 1000 : 0;
    let hls: Hls | null = null;
    let disposed = false;
    let mediaRecoveryAttempts = 0;
    let networkRecoveryAttempts = 0;
    let networkRetryTimer: number | null = null;
    let directStartupTimer: number | null = null;
    let silentAudioChecked = false;

    const isStaleSession = () =>
      disposed || renegotiatingRef.current || activeSessionIdRef.current !== plan.session_id;

    const destroyHlsInstance = (instance: Hls | null) => {
      if (!instance) return;
      if (hlsRef.current === instance) {
        hlsRef.current = null;
      }
      if (hls === instance) {
        hls = null;
      }
      instance.destroy();
    };

    setBuffering(true);
    setError('');
    setDecodedResolution(null);

    const getAbsoluteTime = () => offsetSec + (Number.isFinite(video.currentTime) ? video.currentTime : 0);

    const triggerDirectFallback = (reason: string) => {
      if (plan.mode !== 'direct' || !plan.transcode_enabled || directFallbackUsedRef.current) {
        return false;
      }
      directFallbackUsedRef.current = true;
      setDirectFallbackReason(reason);
      shouldAutoPlayRef.current = true;
      const posMS = Math.floor(getAbsoluteTime() * 1000);
      negotiate(
        buildCurrentOpts({
          force_transcode: true,
          audio_stream_index: plan.selected_audio_index,
          start_position_ms: posMS > 2000 ? posMS : undefined,
        }),
        false,
      );
      return true;
    };

    if (plan.mode !== 'direct' && Hls.isSupported()) {
      setPlayerEngine('hls.js');
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 120,
        maxBufferSize: 180 * 1000 * 1000, // 180 MB headroom for 4K long-GOP remux segments (30–65 MB each)
        maxBufferHole: 0.5,
        nudgeOffset: 0.2,
        nudgeMaxRetry: 5,
        fragLoadingTimeOut: 60000,
        manifestLoadingTimeOut: 45000,
        levelLoadingTimeOut: 45000,
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 6,
        levelLoadingMaxRetry: 4,
        fragLoadingRetryDelay: 1000,
        manifestLoadingRetryDelay: 1000,
        levelLoadingRetryDelay: 1000,
        fragLoadingMaxRetryTimeout: 10000,
        manifestLoadingMaxRetryTimeout: 10000,
        startFragPrefetch: true,
      });
      const hlsInstance = hls;
      hlsRef.current = hlsInstance;

      hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || isStaleSession() || hlsRef.current !== hlsInstance) return;
        const httpCode = data.response?.code;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (httpCode === 429) {
            setBuffering(false);
            setError('Too many concurrent transcode sessions. Please try again shortly.');
            destroyHlsInstance(hlsInstance);
            return;
          }
          if (httpCode === 501) {
            setBuffering(false);
            setError('Server transcoding is unavailable (FFmpeg not configured).');
            destroyHlsInstance(hlsInstance);
            return;
          }
          if (httpCode === 401 || httpCode === 403) {
            setBuffering(false);
            setError('Stream session expired or was stopped. Click Retry to resume.');
            destroyHlsInstance(hlsInstance);
            return;
          }
          if (httpCode === 404 || httpCode === 410) {
            setBuffering(false);
            setError('Stream segment unavailable. Click Retry to restart playback.');
            destroyHlsInstance(hlsInstance);
            return;
          }
          if (networkRecoveryAttempts < 4) {
            networkRecoveryAttempts += 1;
            if (networkRetryTimer !== null) window.clearTimeout(networkRetryTimer);
            networkRetryTimer = window.setTimeout(() => {
              networkRetryTimer = null;
              if (!isStaleSession() && hlsRef.current === hlsInstance) {
                hlsInstance.startLoad();
              }
            }, 1000);
            return;
          }
          setBuffering(false);
          setError(`Network error loading stream (${data.details || httpCode || 'timeout'}). Click Retry to reconnect.`);
          destroyHlsInstance(hlsInstance);
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveryAttempts < 2) {
          mediaRecoveryAttempts += 1;
          if (mediaRecoveryAttempts === 2) {
            hlsInstance.swapAudioCodec();
          }
          hlsInstance.recoverMediaError();
        } else {
          setBuffering(false);
          setError(`Stream playback error (${data.details || data.type}). Try retrying or lowering quality.`);
          destroyHlsInstance(hlsInstance);
        }
      });

      hlsInstance.loadSource(plan.stream_url);
      hlsInstance.attachMedia(video);
    } else {
      setPlayerEngine(plan.mode === 'direct' ? 'native' : 'safari-hls');
      video.src = plan.stream_url;
      if (plan.mode === 'direct' && plan.transcode_enabled && !directFallbackUsedRef.current) {
        directStartupTimer = window.setTimeout(() => {
          directStartupTimer = null;
          if (!isStaleSession() && video.readyState === 0) {
            triggerDirectFallback('Direct Play stalled during startup');
          }
        }, 10000);
      }
    }

    video.volume = volume;
    video.muted = muted;
    video.playbackRate = playbackRate;

    const onLoaded = () => {
      if (directStartupTimer !== null) {
        window.clearTimeout(directStartupTimer);
        directStartupTimer = null;
      }
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setDecodedResolution({ width: video.videoWidth, height: video.videoHeight });
      }
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setMediaDuration(offsetSec + video.duration);
      }
      if (
        plan.mode === 'direct' &&
        plan.resume_position_ms > 2000 &&
        (!video.duration || plan.resume_position_ms / 1000 < video.duration - 2)
      ) {
        video.currentTime = plan.resume_position_ms / 1000;
      }
      if (shouldAutoPlayRef.current) {
        video.play().catch(() => {});
      } else {
        setBuffering(false);
        setPlaying(false);
      }
    };

    const onTime = () => {
      if (draggingRef.current) return;
      const abs = getAbsoluteTime();
      setCurrentTime(abs);
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setDecodedResolution((prev) =>
          prev && prev.width === video.videoWidth && prev.height === video.videoHeight
            ? prev
            : { width: video.videoWidth, height: video.videoHeight },
        );
      }
      if (video.buffered.length > 0) {
        setBufferedEnd(offsetSec + video.buffered.end(video.buffered.length - 1));
      }
      if (typeof video.getVideoPlaybackQuality === 'function') {
        const q = video.getVideoPlaybackQuality();
        if (q && typeof q.droppedVideoFrames === 'number') {
          setDroppedFrames(q.droppedVideoFrames);
        }
      }
      // Detect Direct Play loading video-only with silent/unsupported audio.
      if (
        !silentAudioChecked &&
        plan.mode === 'direct' &&
        plan.transcode_enabled &&
        !directFallbackUsedRef.current &&
        (plan.audio_tracks?.length ?? 0) > 0 &&
        !video.paused &&
        video.currentTime > 2
      ) {
        silentAudioChecked = true;
        const vAny = video as HTMLVideoElement & {
          mozHasAudio?: boolean;
          webkitAudioDecodedByteCount?: number;
          audioTracks?: { length: number };
        };
        const noMozAudio = vAny.mozHasAudio === false;
        const noWebKitAudio =
          typeof vAny.webkitAudioDecodedByteCount === 'number' &&
          vAny.webkitAudioDecodedByteCount === 0 &&
          !video.muted &&
          video.volume > 0;
        const noSafariAudioTracks =
          vAny.audioTracks !== undefined && vAny.audioTracks.length === 0;
        if (noMozAudio || noWebKitAudio || noSafariAudioTracks) {
          triggerDirectFallback('Unsupported audio track in Direct Play');
        }
      }
    };

    const onPlay = () => {
      shouldAutoPlayRef.current = true;
      setPlaying(true);
    };
    const onPlaying = () => {
      networkRecoveryAttempts = 0;
      shouldAutoPlayRef.current = true;
      setPlaying(true);
      setBuffering(false);
    };
    const onCanPlay = () => {
      if (directStartupTimer !== null) {
        window.clearTimeout(directStartupTimer);
        directStartupTimer = null;
      }
      if (shouldAutoPlayRef.current && video.paused && !isStaleSession()) {
        video.play().catch(() => {});
      }
      setBuffering(false);
    };
    const onWaiting = () => setBuffering(true);
    const onPause = () => {
      if (isStaleSession()) return;
      if (!video.ended) {
        shouldAutoPlayRef.current = false;
      }
      setPlaying(false);
      setOsdVisible(true);
      const abs = getAbsoluteTime();
      if (abs > 0 && !video.ended) {
        api
          .updateProgress(itemId, Math.floor(abs * 1000))
          .then(() => onProgressUpdatedRef.current())
          .catch(() => {});
      }
    };

    const onVideoError = () => {
      if (directStartupTimer !== null) {
        window.clearTimeout(directStartupTimer);
        directStartupTimer = null;
      }
      if (isStaleSession()) return;
      // Automatic Direct Play -> Transcode fallback if browser canPlayType() was overly optimistic.
      if (triggerDirectFallback('Browser failed to decode Direct Play stream')) {
        return;
      }
      setBuffering(false);
      setError('Unable to decode this media stream in the browser.');
    };

    const onEnded = () => {
      setPlaying(false);
      setBuffering(false);
      setOsdVisible(true);
      const totalSec = durationRef.current || getAbsoluteTime();
      const finalMs = Math.floor(totalSec * 1000);
      api
        .updateProgress(itemId, finalMs, true)
        .then(() => onProgressUpdatedRef.current())
        .catch(() => {});
      if (
        nextItemRef.current &&
        !upNextDismissedRef.current &&
        userPreferencesRef.current?.autoplay_next !== false
      ) {
        setUpNextCountdown(5);
      }
    };

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onWaiting);
    video.addEventListener('pause', onPause);
    video.addEventListener('error', onVideoError);
    video.addEventListener('ended', onEnded);

    const progressTimer = window.setInterval(() => {
      if (!video.paused && !isStaleSession()) {
        const abs = getAbsoluteTime();
        if (abs > 0) {
          api
            .updateProgress(itemId, Math.floor(abs * 1000), undefined, plan.session_id)
            .then((prog) => {
              if (isStaleSession()) return;
              if (prog.session_stopped) {
                activeSessionIdRef.current = null;
                video.pause();
                if (hls) {
                  destroyHlsInstance(hls);
                } else {
                  video.removeAttribute('src');
                  video.load();
                }
                setPlaying(false);
                setBuffering(false);
                setOsdVisible(true);
                setError('Playback was stopped by an administrator.');
              }
            })
            .catch(() => {});
        }
      }
    }, 5000);

    return () => {
      disposed = true;
      window.clearInterval(progressTimer);
      if (networkRetryTimer !== null) window.clearTimeout(networkRetryTimer);
      if (directStartupTimer !== null) window.clearTimeout(directStartupTimer);
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('stalled', onWaiting);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('error', onVideoError);
      video.removeEventListener('ended', onEnded);
      const abs = getAbsoluteTime();
      if (
        abs > 0 &&
        !video.ended &&
        !renegotiatingRef.current &&
        activeSessionIdRef.current === plan.session_id
      ) {
        api
          .updateProgress(itemId, Math.floor(abs * 1000))
          .then(() => onProgressUpdatedRef.current())
          .catch(() => {});
      }
      if (hls) {
        if (hlsRef.current === hls) {
          destroyHlsInstance(hls);
        }
      } else {
        video.removeAttribute('src');
        video.load();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, itemId]);

  // Stop active playback/transcode session on unmount, page refresh, or tab close
  useEffect(() => {
    mountedRef.current = true;
    const handleUnload = () => {
      stopActiveSession();
    };
    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      mountedRef.current = false;
      negotiateSeqRef.current += 1;
      if (seekDebounceRef.current !== null) {
        window.clearTimeout(seekDebounceRef.current);
        seekDebounceRef.current = null;
      }
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      if (subAbortRef.current) {
        subAbortRef.current.abort();
        subAbortRef.current = null;
      }
      stopActiveSession();
    };
  }, [stopActiveSession]);

  // Load and progressively stream WebVTT subtitle cues whenever selected text subtitle track changes.
  // For embedded tracks in large MKVs, the server streams WebVTT chunks progressively (and supports ?start=<sec>
  // fast seeking) so cues appear in <1.5s instead of blocking until the entire multi-GB file is read.
  // We avoid killing & restarting the subtitle stream on every video seek if the track is already loaded or
  // streaming over the current playback position, preventing competing SMB I/O during seeks.
  const selectedSubTrack = useMemo(() => {
    if (selectedSubIdx === null || !plan) return null;
    const tr = (plan.subtitles ?? []).find((s) => s.index === selectedSubIdx);
    if (!tr || tr.requires_burn_in || !tr.url) return null;
    return tr;
  }, [selectedSubIdx, plan]);

  const planResumeSec = plan ? plan.resume_position_ms / 1000 : 0;

  useEffect(() => {
    if (!selectedSubTrack || !selectedSubTrack.url) {
      subStreamGenRef.current += 1;
      if (subAbortRef.current) {
        subAbortRef.current.abort();
        subAbortRef.current = null;
      }
      subTrackKeyRef.current = '';
      subStreamStartRef.current = 0;
      subStreamCompleteRef.current = false;
      subMaxEndRef.current = 0;
      setSubCues([]);
      setSubStatus('idle');
      return;
    }

    const trackKey = `${itemId}:${selectedSubTrack.index}:${selectedSubTrack.stream_index ?? 'sidecar'}:${subRetryNonce}`;
    const isEmbedded = selectedSubTrack.url.includes('/embedded-');
    const targetSec = Math.max(0, currentTimeRef.current || planResumeSec);
    const sameTrack = subTrackKeyRef.current === trackKey;

    if (sameTrack) {
      // Already fetched the entire track from 0:00 (or sidecar): never re-fetch on seek.
      if (subStreamCompleteRef.current && subStreamStartRef.current <= 0) {
        return;
      }
      // Existing continuous stream already covers the seek target: keep it running uninterrupted.
      if (
        targetSec >= subStreamStartRef.current &&
        (subStreamCompleteRef.current || (subAbortRef.current !== null && targetSec <= subMaxEndRef.current + 30))
      ) {
        return;
      }
    }

    // Abort any previous subtitle stream only when switching tracks or jumping outside the loaded range.
    const gen = ++subStreamGenRef.current;
    if (subAbortRef.current) {
      subAbortRef.current.abort();
    }
    const controller = new AbortController();
    subAbortRef.current = controller;

    const startSec = isEmbedded && targetSec > 15 ? Math.max(0, Math.floor(targetSec - 10)) : 0;
    let fetchUrl = selectedSubTrack.url;
    if (startSec > 0) {
      fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + `start=${startSec}`;
    }

    subTrackKeyRef.current = trackKey;
    subStreamStartRef.current = startSec;
    subStreamCompleteRef.current = false;
    subMaxEndRef.current = startSec;
    if (!sameTrack) {
      setSubCues([]);
    }
    setSubStatus('loading');

    const isCurrent = () => mountedRef.current && subStreamGenRef.current === gen;

    const mergeCues = (existing: Cue[], incoming: Cue[]): Cue[] => {
      if (incoming.length === 0) return existing;
      for (const c of incoming) {
        if (c.end > subMaxEndRef.current) subMaxEndRef.current = c.end;
      }
      if (existing.length === 0) return incoming;
      const seen = new Set(existing.map((c) => `${c.start.toFixed(2)}:${c.end.toFixed(2)}:${c.text}`));
      const merged = existing.slice();
      for (const c of incoming) {
        const k = `${c.start.toFixed(2)}:${c.end.toFixed(2)}:${c.text}`;
        if (!seen.has(k)) {
          seen.add(k);
          merged.push(c);
        }
      }
      return merged;
    };

    (async () => {
      try {
        const res = await fetch(fetchUrl, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!res.body) {
          const vtt = await res.text();
          if (!isCurrent()) return;
          const parsed = parseWebVTT(vtt);
          setSubCues((prev) => (sameTrack ? mergeCues(prev, parsed) : parsed));
          subStreamCompleteRef.current = true;
          if (subAbortRef.current === controller) subAbortRef.current = null;
          setSubStatus('ready');
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let pending = '';
        let markedReady = false;

        while (true) {
          const { value, done } = await reader.read();
          if (!isCurrent()) return;
          if (value) {
            pending += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
            const sepIdx = pending.lastIndexOf('\n\n');
            if (sepIdx !== -1) {
              const complete = pending.slice(0, sepIdx);
              pending = pending.slice(sepIdx + 2);
              const parsed = parseWebVTT(complete);
              if (parsed.length > 0) {
                setSubCues((prev) => mergeCues(prev, parsed));
              }
              if (!markedReady && (parsed.length > 0 || complete.includes('WEBVTT'))) {
                markedReady = true;
                setSubStatus('ready');
              }
            }
          }
          if (done) break;
        }

        const tail = (pending + decoder.decode()).trim();
        if (tail && isCurrent()) {
          const parsed = parseWebVTT(tail);
          if (parsed.length > 0) {
            setSubCues((prev) => mergeCues(prev, parsed));
          }
        }
        if (isCurrent()) {
          subStreamCompleteRef.current = true;
          if (subAbortRef.current === controller) subAbortRef.current = null;
          setSubStatus('ready');
        }
      } catch (err) {
        if (!isCurrent() || (err instanceof DOMException && err.name === 'AbortError')) return;
        if (subAbortRef.current === controller) subAbortRef.current = null;
        if (!sameTrack) {
          setSubCues([]);
        }
        setSubStatus('error');
      }
    })();
  }, [itemId, selectedSubTrack, planResumeSec, subRetryNonce]);

  // Up Next countdown
  useEffect(() => {
    if (upNextCountdown === null || !nextItem) return;
    if (upNextCountdown <= 0) {
      onSelectItem(nextItem);
      return;
    }
    const timer = window.setTimeout(() => {
      setUpNextCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [upNextCountdown, nextItem, onSelectItem]);

  // Track fullscreen & Picture-in-Picture changes
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Track video stage dimensions so subtitles stay cleanly inside the active picture (above letterbox bars)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setStageSize((prev) =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height },
      );
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnterPiP = () => setIsPiP(true);
    const onLeavePiP = () => setIsPiP(false);
    video.addEventListener('enterpictureinpicture', onEnterPiP);
    video.addEventListener('leavepictureinpicture', onLeavePiP);
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnterPiP);
      video.removeEventListener('leavepictureinpicture', onLeavePiP);
    };
  }, []);

  // Mirror parsed subtitle cues into a native TextTrack ONLY while in Picture-in-Picture,
  // keeping normal and fullscreen playback 100% driven by Lune's custom styled overlay.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof VTTCue === 'undefined') return;
    if (!isPiP || selectedSubIdx === null || subCues.length === 0) {
      if (pipTrackRef.current) {
        pipTrackRef.current.mode = 'hidden';
      }
      return;
    }
    let track = pipTrackRef.current;
    if (!track) {
      track = video.addTextTrack('subtitles', 'Subtitles', selectedSubTrack?.language || 'en');
      pipTrackRef.current = track;
    }
    while (track.cues && track.cues.length > 0) {
      track.removeCue(track.cues[0]);
    }
    for (const c of subCues) {
      const localStart = c.start + subOffsetSec - streamOffsetSec;
      const localEnd = c.end + subOffsetSec - streamOffsetSec;
      if (localEnd <= 0 || localEnd <= localStart) continue;
      try {
        track.addCue(new VTTCue(Math.max(0, localStart), localEnd, c.text));
      } catch {
        // ignore invalid cue ranges
      }
    }
    track.mode = 'showing';
  }, [isPiP, selectedSubIdx, selectedSubTrack?.language, subCues, subOffsetSec, streamOffsetSec]);

  // Auto-hide OSD on idle while playing
  const wakeOSD = useCallback(() => {
    setOsdVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && openMenu === 'none' && !draggingRef.current) {
        setOsdVisible(false);
      }
    }, 3000);
  }, [openMenu]);

  useEffect(() => {
    if (openMenu !== 'none') {
      setOsdVisible(true);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    }
  }, [openMenu]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
    wakeOSD();
  }, [wakeOSD]);

  // True seeking across both Direct Play and server-side HLS remux/transcode sessions.
  const seekTo = useCallback(
    (targetSec: number, immediate = false) => {
      const v = videoRef.current;
      const activePlan = planRef.current;
      if (!v || !activePlan) return;
      const maxDur = durationRef.current || v.duration || 0;
      const clamped = Math.max(0, maxDur > 0 ? Math.min(maxDur, targetSec) : targetSec);
      // Update ref synchronously so rapid ArrowRight/ArrowLeft presses accumulate cleanly.
      currentTimeRef.current = clamped;

      if (activePlan.mode === 'direct') {
        if (seekDebounceRef.current !== null) {
          window.clearTimeout(seekDebounceRef.current);
          seekDebounceRef.current = null;
        }
        v.currentTime = clamped;
        setCurrentTime(clamped);
        wakeOSD();
        return;
      }

      const offsetSec = activePlan.resume_position_ms / 1000;
      const localTarget = clamped - offsetSec;
      const playableLocalEnd = Number.isFinite(v.duration) ? v.duration : 0;

      // If target falls inside the already-transcoded HLS window, seek instantaneously on the client.
      if (localTarget >= 0 && playableLocalEnd > 0 && localTarget <= playableLocalEnd - 1.5) {
        if (seekDebounceRef.current !== null) {
          window.clearTimeout(seekDebounceRef.current);
          seekDebounceRef.current = null;
        }
        v.currentTime = localTarget;
        setCurrentTime(clamped);
        wakeOSD();
        return;
      }

      // Scrubber release seeks immediately; keyboard skips debounce briefly (150ms) so rapid taps coalesce.
      shouldAutoPlayRef.current = !v.paused || loading || buffering || shouldAutoPlayRef.current;
      setCurrentTime(clamped);
      if (seekDebounceRef.current !== null) {
        window.clearTimeout(seekDebounceRef.current);
        seekDebounceRef.current = null;
      }
      if (immediate) {
        negotiate(buildCurrentOpts({ start_position_ms: Math.floor(clamped * 1000) }));
      } else {
        seekDebounceRef.current = window.setTimeout(() => {
          seekDebounceRef.current = null;
          negotiate(buildCurrentOpts({ start_position_ms: Math.floor(clamped * 1000) }));
        }, 150);
      }
      wakeOSD();
    },
    [buffering, buildCurrentOpts, loading, negotiate, wakeOSD],
  );

  const seekBy = useCallback(
    (deltaSec: number) => {
      seekTo(currentTimeRef.current + deltaSec);
    },
    [seekTo],
  );

  const applyVolume = useCallback((nextVol: number) => {
    const clamped = Math.max(0, Math.min(1, Math.round(nextVol * 100) / 100));
    setVolume(clamped);
    setMuted(clamped === 0);
    if (videoRef.current) {
      videoRef.current.volume = clamped;
      videoRef.current.muted = clamped === 0;
    }
    try {
      localStorage.setItem(LS_VOLUME, String(clamped));
      localStorage.setItem(LS_MUTED, clamped === 0 ? '1' : '0');
    } catch {
      // ignore
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    setMuted(next);
    try {
      localStorage.setItem(LS_MUTED, next ? '1' : '0');
    } catch {
      // ignore
    }
    wakeOSD();
  }, [muted, wakeOSD]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const togglePiP = useCallback(() => {
    const v = videoRef.current;
    if (!v || !document.pictureInPictureEnabled) return;
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    } else {
      v.requestPictureInPicture().catch(() => {});
    }
  }, []);

  // OS Media Session API (media keys, Control Center, AirPods)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !activeItem) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({
      title: activeItem.title,
      artist: activeItem.series_title || (activeItem.year ? String(activeItem.year) : 'Lune'),
      album:
        activeItem.series_title && activeItem.season_number != null
          ? `Season ${activeItem.season_number}`
          : undefined,
      artwork: activeItem.poster_url ? [{ src: activeItem.poster_url }] : undefined,
    });
    const safeHandler = (action: MediaSessionAction, fn: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        // unsupported action in this browser
      }
    };
    safeHandler('play', () => videoRef.current?.play().catch(() => {}));
    safeHandler('pause', () => videoRef.current?.pause());
    safeHandler('seekbackward', () => seekBy(-10));
    safeHandler('seekforward', () => seekBy(30));
    safeHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number') seekTo(details.seekTime);
    });
    return () => {
      safeHandler('play', null);
      safeHandler('pause', null);
      safeHandler('seekbackward', null);
      safeHandler('seekforward', null);
      safeHandler('seekto', null);
    };
  }, [
    activeItem?.title,
    activeItem?.series_title,
    activeItem?.season_number,
    activeItem?.year,
    activeItem?.poster_url,
    seekBy,
    seekTo,
  ]);

  // Active skippable chapter (OP / ED / Recap) for 1-click Skip button and 'S' shortcut
  const activeSkipChapter = useMemo(() => {
    const chapters = plan?.chapters ?? detail?.chapters ?? [];
    if (chapters.length === 0) return null;
    const ms = currentTime * 1000;
    return (
      chapters.find(
        (ch) =>
          (ch.kind === 'intro' || ch.kind === 'outro' || ch.kind === 'recap') &&
          ms >= ch.start_ms &&
          ms < ch.end_ms - 1200,
      ) ?? null
    );
  }, [plan, detail, currentTime]);

  const skipActiveChapter = useCallback(() => {
    if (!activeSkipChapter) return;
    seekTo(activeSkipChapter.end_ms / 1000);
  }, [activeSkipChapter, seekTo]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault();
          seekBy(-10);
          break;
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault();
          seekBy(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          applyVolume(volume + 0.05);
          wakeOSD();
          break;
        case 'ArrowDown':
          e.preventDefault();
          applyVolume(volume - 0.05);
          wakeOSD();
          break;
        case 'm':
        case 'M':
          toggleMute();
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'i':
        case 'I':
          setShowStats((v) => !v);
          break;
        case 'c':
        case 'C':
          if (plan?.subtitles?.length) {
            const firstText = plan.subtitles.find((s) => !s.requires_burn_in);
            if (firstText) {
              setSelectedSubIdx((cur) => (cur === null ? firstText.index : null));
            }
          }
          break;
        case 's':
        case 'S':
          if (activeSkipChapter) {
            e.preventDefault();
            skipActiveChapter();
          }
          break;
        case 'Escape':
          if (openMenu !== 'none') {
            setOpenMenu('none');
          } else if (!document.fullscreenElement) {
            onClose();
          }
          break;
        default:
          if (e.key >= '0' && e.key <= '9' && !e.metaKey && !e.ctrlKey && !e.altKey && durationRef.current > 0) {
            e.preventDefault();
            seekTo((Number(e.key) / 10) * durationRef.current);
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    togglePlay,
    seekBy,
    seekTo,
    applyVolume,
    volume,
    wakeOSD,
    toggleMute,
    toggleFullscreen,
    onClose,
    openMenu,
    plan,
    activeSkipChapter,
    skipActiveChapter,
  ]);

  function handleQualityChange(preset: QualityPreset) {
    shouldAutoPlayRef.current = videoRef.current ? !videoRef.current.paused || buffering : true;
    setQualityId(preset.id);
    const posMS = Math.floor(currentTimeRef.current * 1000);
    negotiate({
      max_bitrate: preset.maxBitrate,
      max_height: preset.maxHeight,
      force_transcode: preset.forceTranscode,
      audio_stream_index: selectedAudioIdx,
      burn_subtitle_stream_index: burnSubStreamIdx,
      start_position_ms: posMS,
    });
    setOpenMenu('none');
  }

  function handleAudioChange(idx: number | undefined, burnOverride?: number | undefined, clearBurn = false) {
    shouldAutoPlayRef.current = videoRef.current ? !videoRef.current.paused || buffering : true;
    setSelectedAudioIdx(idx);
    const posMS = Math.floor(currentTimeRef.current * 1000);
    negotiate(
      buildCurrentOpts({
        audio_stream_index: idx,
        ...(clearBurn ? { burn_subtitle_stream_index: burnOverride } : {}),
        start_position_ms: posMS,
      }),
    );
    setOpenMenu('none');
  }

  function handleSubtitleSelect(sub: SubtitleStream | null) {
    if (!sub) {
      setSelectedSubIdx(null);
      if (burnSubStreamIdx !== undefined) {
        shouldAutoPlayRef.current = videoRef.current ? !videoRef.current.paused || buffering : true;
        setBurnSubStreamIdx(undefined);
        negotiate(
          buildCurrentOpts({
            burn_subtitle_stream_index: undefined,
            start_position_ms: Math.floor(currentTimeRef.current * 1000),
          }),
        );
      }
      return;
    }

    if (sub.requires_burn_in && sub.stream_index !== undefined) {
      shouldAutoPlayRef.current = videoRef.current ? !videoRef.current.paused || buffering : true;
      setSelectedSubIdx(sub.index);
      setBurnSubStreamIdx(sub.stream_index);
      setSubCues([]);
      negotiate(
        buildCurrentOpts({
          burn_subtitle_stream_index: sub.stream_index,
          start_position_ms: Math.floor(currentTimeRef.current * 1000),
        }),
      );
      setOpenMenu('none');
      return;
    }

    setSelectedSubIdx(sub.index);
    if (burnSubStreamIdx !== undefined) {
      shouldAutoPlayRef.current = videoRef.current ? !videoRef.current.paused || buffering : true;
      setBurnSubStreamIdx(undefined);
      negotiate(
        buildCurrentOpts({
          burn_subtitle_stream_index: undefined,
          start_position_ms: Math.floor(currentTimeRef.current * 1000),
        }),
      );
    }
  }

  function handleSpeedChange(rate: number) {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }

  function handleSubSizeChange(sz: 'sm' | 'md' | 'lg') {
    setSubSize(sz);
    try {
      localStorage.setItem(LS_SUB_SIZE, sz);
    } catch {
      // ignore
    }
  }

  // Dual-audio quick Sub / Dub toggle detection (Japanese + English audio tracks)
  const jpAudioTrack = useMemo(
    () => (plan?.audio_tracks ?? []).find((tr) => normalizeLangCode(tr.language) === 'ja') ?? null,
    [plan],
  );
  const enAudioTrack = useMemo(
    () => (plan?.audio_tracks ?? []).find((tr) => normalizeLangCode(tr.language) === 'en') ?? null,
    [plan],
  );
  const isDualAudioAnime = Boolean(jpAudioTrack && enAudioTrack);
  const activeAudioTrack = useMemo(() => {
    const tracks = plan?.audio_tracks ?? [];
    if (selectedAudioIdx !== undefined) {
      return tracks.find((t) => t.index === selectedAudioIdx) ?? null;
    }
    return tracks.find((t) => t.default) ?? tracks[0] ?? null;
  }, [plan, selectedAudioIdx]);
  const isCurrentlyJapanese = normalizeLangCode(activeAudioTrack?.language) === 'ja';

  function handleToggleSubDub() {
    if (!jpAudioTrack || !enAudioTrack || !plan) return;
    const switchToDub = isCurrentlyJapanese;
    const targetAudio = switchToDub ? enAudioTrack : jpAudioTrack;
    const subs = (plan.subtitles ?? []).filter((s) => !s.requires_burn_in);
    if (switchToDub) {
      const forcedEn = subs.find((s) => s.forced && normalizeLangCode(s.language) === 'en') ?? subs.find((s) => s.forced);
      setSelectedSubIdx(forcedEn ? forcedEn.index : null);
    } else {
      const fullEn =
        subs.find((s) => !s.forced && normalizeLangCode(s.language) === 'en') ??
        subs.find((s) => !s.forced);
      setSelectedSubIdx(fullEn ? fullEn.index : null);
    }
    const hadBurnIn = burnSubStreamIdx !== undefined;
    if (hadBurnIn) {
      setBurnSubStreamIdx(undefined);
    }
    handleAudioChange(targetAudio.index, undefined, hadBurnIn);
  }

  // Scrubber pointer drag + hover preview handlers
  const ratioFromClientX = useCallback((clientX: number) => {
    const el = scrubberRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handleScrubPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    const ratio = ratioFromClientX(e.clientX);
    setCurrentTime(ratio * duration);
    setScrubPreviewSec(ratio * duration);
    setScrubPreviewPct(ratio * 100);
  };

  const handleScrubPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const ratio = ratioFromClientX(e.clientX);
    setScrubPreviewSec(ratio * duration);
    setScrubPreviewPct(ratio * 100);
    if (draggingRef.current) {
      setCurrentTime(ratio * duration);
    }
  };

  const handleScrubPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const ratio = ratioFromClientX(e.clientX);
    seekTo(ratio * duration, true);
  };

  // Active subtitle cues adjusted by user sync offset (uses true absolute currentTime!)
  const activeCueText = useMemo(() => {
    if (selectedSubIdx === null || subCues.length === 0) return '';
    const t = currentTime - subOffsetSec;
    return subCues
      .filter((c) => t >= c.start && t <= c.end)
      .map((c) => c.text)
      .join('\n');
  }, [selectedSubIdx, subCues, currentTime, subOffsetSec]);

  const remainingSec = Math.max(0, duration - currentTime);
  const endsAtLabel = useMemo(() => {
    if (!duration || remainingSec <= 0) return '';
    const endDate = new Date(Date.now() + (remainingSec / playbackRate) * 1000);
    return `Ends at ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [duration, remainingSec, playbackRate]);

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferedPct = duration > 0 ? Math.min(100, (bufferedEnd / duration) * 100) : 0;
  const bufferAheadSec = Math.max(0, bufferedEnd - currentTime);

  const epPrefix =
    activeItem?.series_title && activeItem.season_number != null && activeItem.episode_number != null
      ? `${activeItem.series_title} - S${activeItem.season_number}:E${activeItem.episode_number} - `
      : '';
  const titleText = activeItem
    ? `${epPrefix}${activeItem.title}${activeItem.year && !activeItem.series_title ? ` (${activeItem.year})` : ''}`
    : 'Loading…';

  const subSizeClass =
    subSize === 'sm' ? 'text-base sm:text-lg' : subSize === 'lg' ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-2xl';

  // Keep subtitles cleanly inside the rendered video frame instead of dipping into bottom letterbox bars.
  const subtitleBottomPx = useMemo(() => {
    const vidW = decodedResolution?.width || detail?.video_width || initialItem?.video_width || 0;
    const vidH = decodedResolution?.height || detail?.video_height || initialItem?.video_height || 0;
    let letterboxBottom = 0;
    if (stageSize.width > 0 && stageSize.height > 0 && vidW > 0 && vidH > 0) {
      const renderedH = Math.min(stageSize.height, stageSize.width / (vidW / vidH));
      letterboxBottom = Math.max(0, Math.round((stageSize.height - renderedH) / 2));
    }
    const insideFrame = letterboxBottom + 32;
    return osdVisible ? Math.max(112, insideFrame) : Math.max(48, insideFrame);
  }, [
    decodedResolution?.width,
    decodedResolution?.height,
    detail?.video_width,
    detail?.video_height,
    initialItem?.video_width,
    initialItem?.video_height,
    stageSize.width,
    stageSize.height,
    osdVisible,
  ]);

  const modeBadgeLabel = useMemo(() => {
    if (!plan) return '';
    if (plan.mode === 'direct') return 'Direct Play';
    if (plan.mode === 'remux') return plan.audio_copy ? 'Direct Stream' : 'Direct Stream · Audio Transcode';
    return plan.hw_accel && plan.hw_accel !== 'software'
      ? `Transcode · ${plan.hw_accel.toUpperCase()}`
      : 'Transcode';
  }, [plan]);

  return (
    <div
      ref={containerRef}
      data-theme="dark"
      onMouseMove={wakeOSD}
      className={`fixed inset-x-0 bottom-0 z-40 bg-black flex flex-col select-none ${
        isFullscreen ? 'top-0' : 'top-16'
      } ${!osdVisible && playing ? 'cursor-none' : ''}`}
    >
      {/* Video Stage */}
      <div
        ref={stageRef}
        className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden"
        onClick={() => {
          if (openMenu !== 'none') {
            setOpenMenu('none');
          } else {
            togglePlay();
          }
        }}
        onDoubleClick={toggleFullscreen}
      >
        <video ref={videoRef} className="w-full h-full object-contain" playsInline />

        {/* Loading / Buffering / Error State */}
        {(loading || buffering) && !error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="rounded-full bg-canvas/70 backdrop-blur-md border border-white/12 p-3.5 shadow-2xl">
              <Loader2 className="w-6 h-6 text-ink animate-spin" />
            </div>
          </div>
        )}
        {error && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 flex items-center justify-center bg-black/80 p-6"
          >
            <div className="max-w-md rounded-xl bg-surface border border-danger/40 p-5 text-center space-y-3">
              <div className="text-sm font-semibold text-danger">{error}</div>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    negotiate(
                      buildCurrentOpts({
                        start_position_ms: Math.floor(currentTimeRef.current * 1000),
                      }),
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent-hover text-on-accent font-semibold px-4 py-2 text-xs cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-elevated px-4 py-2 text-xs text-ink cursor-pointer"
                >
                  Back to Library
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Custom Styled Subtitle Overlay (supports live size & sync offset) */}
        {activeCueText && (
          <div
            style={{ bottom: `${subtitleBottomPx}px` }}
            className="absolute inset-x-6 pointer-events-none flex justify-center transition-[bottom] duration-200"
          >
            <div
              className={`${subSizeClass} font-medium text-ink text-center whitespace-pre-line px-4 py-1.5 rounded-lg bg-canvas/75 backdrop-blur-xs shadow-lg max-w-3xl leading-snug`}
              style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}
            >
              {renderFormattedSubtitle(activeCueText)}
            </div>
          </div>
        )}

        {/* Playback Telemetry / Stats for Nerds Overlay */}
        {showStats && plan && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-16 right-5 w-80 rounded-xl bg-canvas/82 backdrop-blur-xl backdrop-saturate-150 border border-white/14 p-4 tabular-nums text-[11px] text-ink-secondary space-y-1.5 shadow-2xl"
          >
            <div className="flex items-center justify-between text-ink font-semibold pb-1 border-b border-white/[0.08]">
              <span>Playback Telemetry</span>
              <button
                type="button"
                onClick={() => setShowStats(false)}
                className="text-ink-secondary hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div>
              Mode: <span className="text-telemetry">{modeBadgeLabel}</span>
            </div>
            <div>
              Pipeline:{' '}
              <span className="text-ink">
                Video {plan.video_copy ? 'Copy' : 'Transcode'} · Audio{' '}
                {plan.audio_copy ? 'Copy' : 'Transcode (AAC)'}
              </span>
            </div>
            {plan.mode === 'transcode' && (
              <div>
                HW Accel:{' '}
                <span className="text-ink">{formatHWAccelLabel(plan.hw_accel)}</span>
              </div>
            )}
            <div>
              Reason: <span className="text-ink">{plan.reason}</span>
            </div>
            {directFallbackReason && (
              <div>
                Fallback: <span className="text-warning">{directFallbackReason}</span>
              </div>
            )}
            <div>
              Player:{' '}
              <span className="text-ink">
                {playerEngine === 'hls.js'
                  ? 'hls.js (fMP4 MSE)'
                  : playerEngine === 'safari-hls'
                    ? 'Safari Native HLS'
                    : 'Native <video>'}
              </span>
            </div>
            <div>
              Container: <span className="text-ink">{detail?.container || initialItem?.container || '—'}</span>
            </div>
            <div>
              Source Video:{' '}
              <span className="text-ink">
                {(detail?.video_codec || initialItem?.video_codec || '—').toUpperCase()}
                {detail?.video_width ? ` ${detail.video_width}×${detail.video_height}` : ''}
                {detail?.video_hdr && detail.video_hdr !== 'sdr' ? ` · ${formatHDRLabel(detail.video_hdr)}` : ''}
              </span>
            </div>
            {decodedResolution && (
              <div>
                Output Video:{' '}
                <span className="text-ink">
                  {decodedResolution.width}×{decodedResolution.height}
                </span>
              </div>
            )}
            <div>
              Source Audio:{' '}
              <span className="text-ink">
                {(activeAudioTrack?.codec || detail?.audio_codec || initialItem?.audio_codec || '—').toUpperCase()}
                {activeAudioTrack?.channels ? ` ${activeAudioTrack.channels}ch` : ''}
              </span>
            </div>
            {plan.burn_subtitle_stream_index !== undefined && (
              <div>
                Subtitles: <span className="text-warning">Burn-in (stream #{plan.burn_subtitle_stream_index})</span>
              </div>
            )}
            {detail?.bitrate ? (
              <div>
                Source Bitrate: <span className="text-ink">{(detail.bitrate / 1_000_000).toFixed(1)} Mbps</span>
              </div>
            ) : null}
            <div>
              Buffer Ahead: <span className="text-ink">{bufferAheadSec.toFixed(1)}s</span> · Dropped:{' '}
              <span className="text-ink">{droppedFrames}</span>
            </div>
            <div>
              Speed: <span className="text-ink">{playbackRate}×</span>
              {streamOffsetSec > 0 ? ` · Seek Offset: ${formatClock(streamOffsetSec)}` : ''}
            </div>
            {selectedSubIdx !== null && (
              <div>
                Sub Offset:{' '}
                <span className="text-ink">
                  {subOffsetSec >= 0 ? `+${subOffsetSec.toFixed(2)}s` : `${subOffsetSec.toFixed(2)}s`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Skip Intro / Opening / Ending / Recap Floating Pill */}
        {activeSkipChapter && upNextCountdown === null && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`absolute right-6 transition-all duration-200 ${osdVisible ? 'bottom-28' : 'bottom-10'}`}
          >
            <button
              type="button"
              onClick={skipActiveChapter}
              className="inline-flex items-center gap-2 rounded-xl bg-canvas/75 hover:bg-accent text-ink hover:text-on-accent border border-white/25 hover:border-accent backdrop-blur-xl backdrop-saturate-150 px-4 py-2.5 text-xs font-semibold shadow-2xl transition-all cursor-pointer"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>
                {activeSkipChapter.kind === 'intro'
                  ? 'Skip Opening'
                  : activeSkipChapter.kind === 'outro'
                    ? 'Skip Ending'
                    : 'Skip Recap'}
              </span>
              <span className="tabular-nums text-[10px] opacity-65 ml-0.5">S</span>
            </button>
          </div>
        )}

        {/* Up Next Overlay */}
        {upNextCountdown !== null && nextItem && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-28 right-6 w-80 rounded-xl bg-canvas/82 backdrop-blur-xl backdrop-saturate-150 border border-white/25 p-4 shadow-2xl"
          >
            <div className="flex items-center justify-between text-[10px] tabular-nums uppercase tracking-wider text-telemetry mb-1">
              <span>Up Next in {upNextCountdown}s</span>
              <button
                type="button"
                onClick={() => {
                  setUpNextDismissed(true);
                  setUpNextCountdown(null);
                }}
                className="text-ink-secondary hover:text-ink cursor-pointer"
              >
                Cancel
              </button>
            </div>
            <div className="text-sm font-semibold text-ink truncate">
              S{String(nextItem.season_number ?? 0).padStart(2, '0')}E
              {String(nextItem.episode_number ?? 0).padStart(2, '0')} · {nextItem.title}
            </div>
            <button
              type="button"
              onClick={() => onSelectItem(nextItem)}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent hover:bg-accent-hover text-on-accent font-semibold text-xs py-2 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Play Now
            </button>
          </div>
        )}

        {/* Top OSD Bar */}
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-0 inset-x-0 px-5 py-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between gap-4 transition-opacity duration-300 ${
            osdVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-ink/90 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Back (Esc)"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span className="text-sm sm:text-base font-medium text-ink truncate">{titleText}</span>
            {plan && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-canvas/70 border border-telemetry/30 tabular-nums text-[10px] text-telemetry shrink-0">
                <Radio className="w-3 h-3" />
                {modeBadgeLabel}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowStats((v) => !v)}
            title="Playback Telemetry (I)"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              showStats ? 'bg-white/15 text-ink' : 'text-ink/80 hover:text-white hover:bg-white/10'
            }`}
          >
            <Info className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom OSD Control Deck */}
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute bottom-0 inset-x-0 px-5 pb-4 pt-12 bg-gradient-to-t from-black/90 via-black/60 to-transparent transition-opacity duration-300 ${
            osdVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Scrubber Row */}
          <div className="flex items-center gap-3 mb-2.5">
            <span className="tabular-nums text-xs text-ink w-14 text-right">
              {formatClock(currentTime)}
            </span>

            <div
              ref={scrubberRef}
              className="relative flex-1 h-5 flex items-center cursor-pointer group touch-none"
              onPointerDown={handleScrubPointerDown}
              onPointerMove={handleScrubPointerMove}
              onPointerUp={handleScrubPointerUp}
              onPointerLeave={() => {
                if (!draggingRef.current) setScrubPreviewSec(null);
              }}
            >
              {/* Hover / Drag Timestamp Tooltip */}
              {scrubPreviewSec !== null && duration > 0 && (
                <div
                  className="absolute -top-8 -translate-x-1/2 px-2 py-0.5 rounded-md bg-canvas/90 border border-white/15 tabular-nums text-[11px] text-ink shadow-lg pointer-events-none whitespace-nowrap"
                  style={{ left: `${Math.min(97, Math.max(3, scrubPreviewPct))}%` }}
                >
                  {formatClock(scrubPreviewSec)}
                </div>
              )}

              <div className="w-full h-1 group-hover:h-1.5 transition-all rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full bg-white/30 transition-all"
                  style={{ width: `${bufferedPct}%` }}
                />
              </div>
              <div
                className="absolute left-0 h-1 group-hover:h-1.5 transition-all rounded-full bg-white"
                style={{ width: `${progressPct}%` }}
              />
              {/* Subtle MKV chapter ticks (OP / ED / Chapters) */}
              {duration > 0 &&
                (plan?.chapters ?? detail?.chapters ?? []).map((ch) => {
                  const leftPct = Math.min(99, Math.max(0, (ch.start_ms / 1000 / duration) * 100));
                  if (leftPct <= 0.5) return null;
                  const isSpecial = ch.kind === 'intro' || ch.kind === 'outro';
                  return (
                    <div
                      key={ch.index}
                      title={ch.title || `Chapter ${ch.index + 1}`}
                      className={`absolute w-0.5 h-2 rounded-full pointer-events-none ${
                        isSpecial ? 'bg-white/80' : 'bg-white/40'
                      }`}
                      style={{ left: `${leftPct}%` }}
                    />
                  );
                })}
              <div
                className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.65)] -translate-x-1/2 scale-90 group-hover:scale-110 transition-transform pointer-events-none"
                style={{ left: `${progressPct}%` }}
              />
            </div>

            <span className="tabular-nums text-xs text-ink-secondary w-14">
              -{formatClock(remainingSec)}
            </span>
          </div>

          {/* Transport + Modifiable Menus Row */}
          <div className="relative flex items-center justify-between gap-4">
            {/* Left Transport Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2.5">
              <button
                type="button"
                onClick={() => seekBy(-10)}
                title="Back 10s (← / J)"
                className="p-2 rounded-lg text-ink/85 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={togglePlay}
                title="Play / Pause (Space / K)"
                className="p-2 rounded-lg text-ink hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                {playing ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>

              <button
                type="button"
                onClick={() => seekBy(30)}
                title="Forward 30s"
                className="p-2 rounded-lg text-ink/85 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {nextItem && (
                <button
                  type="button"
                  onClick={() => onSelectItem(nextItem)}
                  title={`Next: ${nextItem.title}`}
                  className="p-2 rounded-lg text-ink/85 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              )}

              {endsAtLabel && (
                <span className="hidden sm:inline text-xs text-ink-secondary ml-2 tabular-nums">
                  {endsAtLabel}
                </span>
              )}
            </div>

            {/* Right Controls: Sub/Dub, CC, Volume, Settings, PiP, Fullscreen */}
            <div className="flex items-center gap-1 sm:gap-2">
              {isDualAudioAnime && (
                <button
                  type="button"
                  onClick={handleToggleSubDub}
                  title={
                    isCurrentlyJapanese
                      ? 'Switch to English Dub (with Signs & Songs)'
                      : 'Switch to Japanese Subbed (with Full Subtitles)'
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface/80 hover:bg-elevated border border-white/18 text-[11px] tabular-nums text-ink hover:text-ink transition-colors cursor-pointer"
                >
                  <Languages className="w-3.5 h-3.5 text-telemetry" />
                  <span>{isCurrentlyJapanese ? 'SUB · JP' : 'DUB · EN'}</span>
                </button>
              )}

              {/* Subtitles Menu Trigger */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenMenu(openMenu === 'subtitles' ? 'none' : 'subtitles')}
                  title="Subtitles & Appearance (C)"
                  className={`p-2 rounded-lg transition-colors cursor-pointer ${
                    selectedSubIdx !== null || openMenu === 'subtitles'
                      ? 'text-telemetry bg-telemetry/15'
                      : 'text-ink/85 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Subtitles className="w-4 h-4" />
                </button>

                {openMenu === 'subtitles' && (
                  <div className="absolute bottom-12 right-0 w-76 rounded-xl bg-canvas/86 backdrop-blur-xl backdrop-saturate-150 border border-white/14 p-4 shadow-2xl space-y-4 max-h-[70vh] overflow-y-auto">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-secondary mb-2">
                        Subtitles
                      </div>
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => handleSubtitleSelect(null)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer ${
                            selectedSubIdx === null ? 'bg-white/12 text-ink' : 'text-ink-secondary hover:bg-surface'
                          }`}
                        >
                          <span>Off</span>
                          {selectedSubIdx === null && <Check className="w-3.5 h-3.5 text-telemetry" />}
                        </button>
                        {(plan?.subtitles ?? []).map((sub) => (
                          <button
                            key={sub.index}
                            type="button"
                            onClick={() => handleSubtitleSelect(sub)}
                            className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer ${
                              selectedSubIdx === sub.index
                                ? 'bg-white/12 text-ink'
                                : 'text-ink-secondary hover:bg-surface'
                            }`}
                          >
                            <span className="truncate flex items-center gap-1.5">
                              <span className="truncate">{sub.label}</span>
                              {sub.format && (
                                <span className="px-1 py-0.2 rounded bg-elevated tabular-nums text-[9px] uppercase text-ink shrink-0">
                                  {formatSubBadge(sub.format)}
                                </span>
                              )}
                              {sub.requires_burn_in && (
                                <span className="px-1 py-0.2 rounded bg-warning/15 text-[9px] text-warning shrink-0">
                                  Burn-in
                                </span>
                              )}
                            </span>
                            {selectedSubIdx === sub.index && <Check className="w-3.5 h-3.5 text-telemetry shrink-0" />}
                          </button>
                        ))}
                        {(plan?.subtitles ?? []).length === 0 && (
                          <p className="text-[11px] text-ink-muted px-2 py-1">
                            No embedded or sidecar subtitles found.
                          </p>
                        )}
                      </div>
                      {subStatus === 'loading' && (
                        <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface/80 text-[11px] text-ink-secondary">
                          <Loader2 className="w-3 h-3 animate-spin text-telemetry shrink-0" />
                          <span>Extracting subtitles…</span>
                        </div>
                      )}
                      {subStatus === 'error' && (
                        <div className="mt-2 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-warning/10 border border-warning/25 text-[11px] text-warning">
                          <span>Subtitle extraction timed out or failed.</span>
                          <button
                            type="button"
                            onClick={() => setSubRetryNonce((n) => n + 1)}
                            className="underline hover:text-ink shrink-0 cursor-pointer"
                          >
                            Retry
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Subtitle Size */}
                    <div className="pt-3 border-t border-white/[0.08]">
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-secondary mb-2">
                        Text Size
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['sm', 'md', 'lg'] as const).map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => handleSubSizeChange(sz)}
                            className={`py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                              subSize === sz
                                ? 'bg-accent text-on-accent'
                                : 'bg-surface text-ink-secondary hover:text-ink'
                            }`}
                          >
                            {sz === 'sm' ? 'Small' : sz === 'md' ? 'Medium' : 'Large'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Subtitle Sync Offset */}
                    <div className="pt-3 border-t border-white/[0.08]">
                      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-ink-secondary mb-2">
                        <span>Timing Offset</span>
                        <span className="tabular-nums text-telemetry">
                          {subOffsetSec >= 0 ? `+${subOffsetSec.toFixed(2)}s` : `${subOffsetSec.toFixed(2)}s`}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSubOffsetSec((o) => Math.round((o - 0.25) * 100) / 100)}
                          className="py-1.5 rounded-lg bg-surface hover:bg-elevated text-xs tabular-nums text-ink cursor-pointer"
                        >
                          -0.25s
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubOffsetSec(0)}
                          className="py-1.5 rounded-lg bg-surface hover:bg-elevated text-xs text-ink-secondary cursor-pointer"
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubOffsetSec((o) => Math.round((o + 0.25) * 100) / 100)}
                          className="py-1.5 rounded-lg bg-surface hover:bg-elevated text-xs tabular-nums text-ink cursor-pointer"
                        >
                          +0.25s
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Volume */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleMute}
                  title="Mute (M)"
                  className="p-2 rounded-lg text-ink/85 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => applyVolume(Number(e.target.value))}
                  className="hidden sm:block w-20 accent-white cursor-pointer"
                />
              </div>

              {/* Playback Settings Menu Trigger */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenMenu(openMenu === 'settings' ? 'none' : 'settings')}
                  title="Playback Quality, Audio & Speed"
                  className={`p-2 rounded-lg transition-colors cursor-pointer ${
                    openMenu === 'settings'
                      ? 'text-telemetry bg-telemetry/15'
                      : 'text-ink/85 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                </button>

                {openMenu === 'settings' && (
                  <div className="absolute bottom-12 right-0 w-72 rounded-xl bg-canvas/86 backdrop-blur-xl backdrop-saturate-150 border border-white/14 p-4 shadow-2xl space-y-4 max-h-[70vh] overflow-y-auto">
                    {/* Quality */}
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-ink-secondary mb-2">
                        <span>Quality</span>
                        {plan && !plan.transcode_enabled && (
                          <span className="tabular-nums text-ink-muted normal-case">Direct only</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {availablePresets.map((preset) => {
                          const disabled = Boolean(preset.forceTranscode && plan && !plan.transcode_enabled);
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              disabled={disabled}
                              onClick={() => handleQualityChange(preset)}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs ${
                                disabled
                                  ? 'text-ink-muted/50 cursor-not-allowed'
                                  : qualityId === preset.id
                                    ? 'bg-white/12 text-ink cursor-pointer'
                                    : 'text-ink-secondary hover:bg-surface cursor-pointer'
                              }`}
                            >
                              <span>{preset.label}</span>
                              {qualityId === preset.id && <Check className="w-3.5 h-3.5 text-telemetry" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Audio Track Selector */}
                    {(plan?.audio_tracks ?? []).length > 0 && (
                      <div className="pt-3 border-t border-white/[0.08]">
                        <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-secondary mb-2">
                          Audio Track
                        </div>
                        <div className="space-y-1">
                          {(plan?.audio_tracks ?? []).map((tr) => {
                            const active =
                              selectedAudioIdx === tr.index ||
                              (selectedAudioIdx === undefined && tr.default);
                            return (
                              <button
                                key={tr.index}
                                type="button"
                                onClick={() => handleAudioChange(tr.index)}
                                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer ${
                                  active ? 'bg-white/12 text-ink' : 'text-ink-secondary hover:bg-surface'
                                }`}
                              >
                                <span className="truncate">
                                  {(tr.language || 'Track').toUpperCase()} · {tr.codec.toUpperCase()}
                                  {tr.channels ? ` ${tr.channels}ch` : ''}
                                  {tr.title ? ` (${tr.title})` : ''}
                                </span>
                                {active && <Check className="w-3.5 h-3.5 text-telemetry shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Playback Speed */}
                    <div className="pt-3 border-t border-white/[0.08]">
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-secondary mb-2">
                        Playback Speed
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {SPEEDS.map((spd) => (
                          <button
                            key={spd}
                            type="button"
                            onClick={() => handleSpeedChange(spd)}
                            className={`py-1.5 rounded-lg text-xs tabular-nums cursor-pointer ${
                              playbackRate === spd
                                ? 'bg-accent text-on-accent font-semibold'
                                : 'bg-surface text-ink-secondary hover:text-ink'
                            }`}
                          >
                            {spd}×
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Picture-in-Picture */}
              <button
                type="button"
                onClick={togglePiP}
                title="Picture in Picture"
                className="hidden sm:inline-flex p-2 rounded-lg text-ink/85 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>

              {/* Fullscreen */}
              <button
                type="button"
                onClick={toggleFullscreen}
                title="Fullscreen (F)"
                className="p-2 rounded-lg text-ink/85 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatHDRLabel(hdr: string): string {
  switch (hdr.toLowerCase()) {
    case 'dovi_hdr10':
      return 'DV · HDR10';
    case 'dovi':
      return 'DV';
    case 'hdr10plus':
      return 'HDR10+';
    default:
      return hdr.toUpperCase();
  }
}

function formatHWAccelLabel(hw?: string): string {
  switch ((hw ?? '').toLowerCase()) {
    case 'vaapi':
      return 'VA-API (GPU)';
    case 'qsv':
      return 'Intel QSV (GPU)';
    case 'nvenc':
      return 'NVIDIA NVENC (GPU)';
    case 'videotoolbox':
      return 'Apple VideoToolbox (GPU)';
    case 'software':
    case '':
      return 'Software (CPU · libx264)';
    default:
      return hw ?? 'Software';
  }
}

function formatSubBadge(format: string): string {
  switch (format.toLowerCase()) {
    case 'subrip':
      return 'SRT';
    case 'hdmv_pgs_subtitle':
    case 'pgssub':
      return 'PGS';
    case 'dvd_subtitle':
    case 'vobsub':
      return 'VOBSUB';
    case 'dvb_subtitle':
    case 'dvbsub':
      return 'DVB';
    default:
      return format.toUpperCase();
  }
}

function formatClock(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return '0:00';
  const s = Math.floor(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  }
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function parseWebVTT(vtt: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = vtt.replace(/\r\n/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx === -1) continue;
    const [startRaw, endRaw] = lines[timeIdx].split('-->').map((s) => s.trim().split(/\s+/)[0]);
    const start = parseVTTTime(startRaw);
    const end = parseVTTTime(endRaw);
    const text = decodeVTTEscaped(
      lines
        .slice(timeIdx + 1)
        .join('\n')
        .replace(/<(?!\/?(?:i|b|u)\b)[^>]+>/gi, ''),
    );
    if (text && Number.isFinite(start) && Number.isFinite(end)) {
      cues.push({ start, end, text });
    }
  }
  return cues;
}

function decodeVTTEscaped(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function renderFormattedSubtitle(text: string): ReactNode {
  if (!/<\/?(?:i|b|u)>/i.test(text)) return text;
  const tokens = text.split(/(<\/?(?:i|b|u)>)/gi);
  const stack: string[] = [];
  const out: ReactNode[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok) continue;
    const open = tok.match(/^<(i|b|u)>$/i);
    if (open) {
      stack.push(open[1].toLowerCase());
      continue;
    }
    const close = tok.match(/^<\/(i|b|u)>$/i);
    if (close) {
      const idx = stack.lastIndexOf(close[1].toLowerCase());
      if (idx !== -1) stack.splice(idx, 1);
      continue;
    }
    let node: ReactNode = tok;
    if (stack.includes('u')) node = <span className="underline">{node}</span>;
    if (stack.includes('b')) node = <strong className="font-semibold">{node}</strong>;
    if (stack.includes('i')) node = <em className="italic">{node}</em>;
    out.push(<span key={i}>{node}</span>);
  }
  return out;
}

function parseVTTTime(raw: string): number {
  const parts = raw.split(':');
  if (parts.length === 3) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  }
  if (parts.length === 2) {
    return Number(parts[0]) * 60 + Number(parts[1]);
  }
  return NaN;
}
