export interface SystemInfo {
  brand: string;
  tagline: string;
  version: string;
  edge_mode: string;
  public_url?: string;
  setup_required: boolean;
  auth_methods: string[];
  requests_enabled?: boolean;
}

export type EdgeMode = 'local' | 'acme' | 'proxy' | 'tailscale';

export interface NetworkConfig {
  edge_mode: EdgeMode;
  active_edge_mode?: string;
  restart_required?: boolean;
  public_url: string;
  trusted_proxies: string;
  domain: string;
  acme_email: string;
  acme_staging: boolean;
  acme_dns_provider: '' | 'cloudflare';
  cf_api_token: string;
  has_cf_api_token?: boolean;
  admin_lan_only?: boolean;
  ip_allowlist?: string;
  ip_blocklist?: string;
}

export interface IPBan {
  ip: string;
  reason: string;
  strikes: number;
  banned_at: string;
  expires_at?: string;
  permanent: boolean;
}

export interface TOTPSetupResponse {
  secret: string;
  otpauth_url: string;
  issuer: string;
  account: string;
}

export interface TOTPEnableResponse {
  enabled: boolean;
  recovery_codes: string[];
}

export interface TranscoderStatus {
  ffmpeg_available: boolean;
  hw_accel: string;        // "vaapi" | "qsv" | "nvenc" | "videotoolbox" | "software"
  vaapi_device?: string;   // e.g. "/dev/dri/renderD128"
  hdr_tonemap: boolean;    // CPU zscale+tonemap
  tonemap_vaapi: boolean;  // GPU VA-API tone-mapping
  libplacebo: boolean;     // libplacebo Dolby Vision tone-mapping
  probe_notes?: string[];  // startup probe diagnostics (e.g. EACCES or driver errors)
}

export interface StreamingConfig {
  max_global_transcodes: number; // 0 = unlimited
  max_user_transcodes: number;   // 0 = unlimited
  idle_timeout_minutes: number;  // 1..120
  /** Look up intro/recap/credits timestamps on introdb.app (default true). */
  introdb_enabled?: boolean;
  transcoder?: TranscoderStatus;
}

export interface MaintenanceConfig {
  enabled: boolean;
  interval_hours: number;
  schedule_time?: string;
  cleanup_orphaned_artwork: boolean;
  artwork_grace_hours: number;
  cleanup_transcode_cache: boolean;
  subtitle_cache_days: number;
  prune_audit_logs: boolean;
  audit_retention_days: number;
  optimize_database: boolean;
  generate_chapter_thumbnails: boolean;
  /** Scrubbing preview sprite sheets (keyframe-only). Server default: false. */
  generate_trickplay?: boolean;
  /** Seconds between preview thumbnails (2–60, default 10). */
  trickplay_interval_seconds?: number;
  /** Preview thumbnail width in px (even, 160–480, default 320). */
  trickplay_width?: number;
}

export type MaintenanceTask =
  | 'artwork'
  | 'transcode_cache'
  | 'audit'
  | 'chapter_thumbnails'
  | 'trickplay'
  | 'optimize_db';

export interface MaintenanceProgress {
  stage: string;
  label: string;
  detail?: string;
  completed: number;
  total: number;
  percent: number;
  step: number;
  total_steps: number;
}

export interface MaintenanceRunReport {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  trigger: 'scheduled' | 'manual' | 'resume' | 'new_media' | string;
  task?: MaintenanceTask | string;
  canceled?: boolean;
  skipped_artwork_scan_busy?: boolean;
  skipped_chapters_busy?: boolean;
  artwork_files_removed: number;
  artwork_bytes_freed: number;
  transcode_items_removed: number;
  transcode_bytes_freed: number;
  audit_events_pruned: number;
  database_optimized: boolean;
  chapter_thumbnails_generated: number;
  chapter_thumbnails_existing?: number;
  chapter_thumbnails_total?: number;
  chapter_thumbnails_missing_files?: number;
  /** Chapters FFmpeg could not extract; skipped until the file changes. */
  chapter_thumbnails_failed?: number;
  skipped_trickplay_busy?: boolean;
  trickplay_generated?: number;
  trickplay_existing?: number;
  trickplay_total?: number;
  trickplay_failed?: number;
  /** Total on-disk size of all current scrubbing preview sets. */
  trickplay_bytes?: number;
  errors?: string[];
  /** Overall result; `skipped` means nothing requested could run (older servers omit it). */
  outcome?: 'completed' | 'partial' | 'skipped' | 'canceled' | string;
  /** Tasks that did not run or yielded part-way, with a human-readable reason. */
  skipped?: MaintenanceSkippedTask[];
}

export interface MaintenanceSkippedTask {
  task: MaintenanceTask | string;
  /** e.g. "Library scan in progress", "Playback in progress", "FFmpeg not available". */
  reason: string;
}

export interface MaintenanceStatus {
  config: MaintenanceConfig;
  running: boolean;
  progress?: MaintenanceProgress;
  last_run?: MaintenanceRunReport;
  next_run_at?: string;
  server_timezone?: string;
  /** True while chapter still generation is paused and will resume once playback/scans end. */
  chapters_resume_pending?: boolean;
  /** True while a chapter stills / trickplay pass for newly scanned media waits for the server to be idle. */
  new_media_pending?: boolean;
}

export interface HealthStatus {
  status: string;
  version: string;
  edge_mode: string;
  database_ok: boolean;
  uptime_seconds: number;
}

export type PosterBadge = 'resolution' | 'hdr' | 'dual_audio' | 'seasons' | 'rating';

export type SubtitleSize = 'small' | 'medium' | 'large';
export type SubtitleColor = 'white' | 'yellow' | 'cyan' | 'green' | 'magenta';

/** Synced across clients via user preferences. */
export interface SubtitleStyle {
  size: SubtitleSize;
  color: SubtitleColor;
  background: boolean;
  outline: boolean;
}

export interface UserPreferences {
  audio_language?: string;
  subtitle_language?: string;
  subtitles_enabled: boolean;
  autoplay_next: boolean;
  max_bitrate?: number;
  combine_next_up?: boolean;
  /** Draw chapter tick marks on the player scrub bar (default true). */
  show_chapter_markers?: boolean;
  poster_badges?: PosterBadge[];
  /** Auto-skip modes for PlaybackPlan.segments (defaults: intro/recap 'countdown', credits 'off'). */
  auto_skip_intro?: AutoSkipMode;
  auto_skip_recap?: AutoSkipMode;
  /** Episodes only: outro (credits) and preview segments. */
  auto_skip_credits?: AutoSkipMode;
  /** Omitted until first saved; omitting it on update keeps the stored value. */
  subtitle_style?: SubtitleStyle;
}

/** 'off' shows the Skip button only, 'countdown' skips after 5 s (cancellable), 'instant' skips at once. */
export type AutoSkipMode = 'off' | 'countdown' | 'instant';

/** A skippable span in PlaybackPlan.segments (chapter markers first, then IntroDB). */
export interface SkipSegment {
  kind: 'intro' | 'recap' | 'outro' | 'preview';
  start_ms: number;
  end_ms: number;
  source: 'chapter' | 'introdb';
}

export interface User {
  id: string;
  username: string;
  display_name: string;
  role: 'admin' | 'member';
  avatar_url?: string;
  all_libraries?: boolean;
  can_request?: boolean;
  auto_approve_requests?: boolean;
  totp_enabled?: boolean;
  totp_required?: boolean;
  preferences?: UserPreferences;
}

export interface UserProfile extends User {
  all_libraries: boolean;
  library_ids: string[];
  preferences: UserPreferences;
  active_sessions: number;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SessionInfo {
  id: string;
  client_name: string;
  client_kind: string;
  ip_address: string;
  expires_at: string;
  last_seen_at: string;
  current: boolean;
}

export interface ScanStatus {
  library_id: string;
  running: boolean;
  scanned: number;
  /** Candidate files found for this scan; 0/undefined until the directory walk finishes. */
  total?: number;
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  errors: number;
  last_error?: string;
  error_samples?: { path?: string; message: string }[];
  started_at?: string;
  finished_at?: string;
}

/** Whole-number scan progress (0-100), or null while the total is unknown. */
export function scanPercent(scan?: ScanStatus | null): number | null {
  if (!scan?.running || !scan.total || scan.total <= 0) return null;
  return Math.min(100, Math.max(0, Math.floor((scan.scanned / scan.total) * 100)));
}

export interface Library {
  id: string;
  name: string;
  kind: 'movies' | 'shows' | 'anime' | 'music' | 'other';
  root_path: string;
  item_count: number;
  scan: ScanStatus;
  created_at: string;
}

export interface ChapterInfo {
  index: number;
  title?: string;
  start_ms: number;
  end_ms: number;
  kind: 'intro' | 'outro' | 'recap' | 'preview' | 'chapter';
  thumbnail_url?: string;
}

export interface MediaItemSummary {
  id: string;
  library_id: string;
  kind: string;
  title: string;
  original_title?: string;
  year?: number;
  series_title?: string;
  season_number?: number;
  episode_number?: number;
  absolute_episode_number?: number;
  release_group?: string;
  container?: string;
  duration_ms: number;
  video_codec?: string;
  video_width?: number;
  video_height?: number;
  video_hdr?: string;
  audio_codec?: string;
  audio_channels?: number;
  audio_languages?: string[];
  dual_audio?: boolean;
  poster_url?: string;
  backdrop_url?: string;
  overview?: string;
  rating?: number;
  content_rating?: string;
  genres?: string[];
  created_at: string;
}

export interface StreamInfo {
  index: number;
  type: 'video' | 'audio' | 'subtitle';
  codec: string;
  profile?: string;
  language?: string;
  title?: string;
  width?: number;
  height?: number;
  hdr?: string;
  channels?: number;
  channel_layout?: string;
  default?: boolean;
  forced?: boolean;
}

export interface CreditPerson {
  name: string;
  role?: string;
  department?: string;
  photo_url?: string;
}

export interface MediaItemDetail extends MediaItemSummary {
  overview?: string;
  tagline?: string;
  content_rating?: string;
  release_date?: string;
  rating?: number;
  genres: string[];
  directors: string[];
  writers: string[];
  studios: string[];
  cast: CreditPerson[];
  tmdb_id?: string;
  imdb_id?: string;
  file_path?: string;
  file_size: number;
  bitrate: number;
  streams: StreamInfo[];
  chapters?: ChapterInfo[];
  audio_tracks?: AudioTrack[];
  subtitles?: SubtitleStream[];
  selected_audio_index?: number;
  selected_subtitle_index?: number;
  progress?: PlaybackProgress;
  in_watchlist?: boolean;
  is_favorite?: boolean;
}

export interface DirectLink {
  stream_url: string;
  download_url: string;
  filename: string;
  expires_at: string;
}

export interface PlaybackLaunchOptions {
  audioStreamIndex?: number;
  subtitleIndex?: number | null;
  burnSubtitleStreamIndex?: number;
  startPositionMS?: number;
}

export type DiscoverFilterKind = 'genre' | 'person' | 'studio';

export interface DiscoverFilter {
  kind: DiscoverFilterKind;
  value: string;
}

export interface PlaybackProgress {
  item_id: string;
  position_ms: number;
  duration_ms: number;
  completed: boolean;
  play_count: number;
  last_played_at?: string;
  session_stopped?: boolean;
}

export interface ContinueWatchingItem {
  item: MediaItemSummary;
  progress: PlaybackProgress;
}

export interface NextUpItem {
  item: MediaItemSummary;
  last_played_at: string;
}

export interface NextUpResponse {
  items: NextUpItem[];
}

export interface LibraryFacets {
  genres: string[];
  content_ratings: string[];
  years: number[];
  has_4k: boolean;
  has_hdr: boolean;
  has_dual_audio: boolean;
}

export interface LibraryFilters {
  genre?: string;
  content_rating?: string;
  min_rating?: number;
  year?: number;
  decade?: number;
  resolution?: '4k' | '1080p' | '720p';
  hdr?: boolean;
  dual_audio?: boolean;
  watched?: 'watched' | 'unwatched';
}

export type SortOption = 'title' | 'recent' | 'year' | 'rating';

export interface AudioTrack {
  index: number;
  codec: string;
  language?: string;
  title?: string;
  channels?: number;
  channel_layout?: string;
  default?: boolean;
}

export interface SubtitleStream {
  index: number;
  language: string;
  label: string;
  format?: string;
  source?: 'sidecar' | 'embedded' | 'burn_in';
  forced?: boolean;
  requires_burn_in?: boolean;
  stream_index?: number;
  url: string;
}

/**
 * Each sheet is a `columns` x `rows` grid of `thumb_width` x `thumb_height` tiles in row-major
 * order; tile n lives on sheet n/(columns*rows). Tile n starts at `timestamps_ms[n]` when the
 * server dropped near-duplicate tiles, otherwise at n*interval_ms, and lasts until the next tile.
 */
export interface TrickplayInfo {
  /** Sheet image format: avif (default on most servers), webp, or jpg. */
  format?: 'avif' | 'webp' | 'jpg';
  timestamps_ms?: number[];
  interval_ms: number;
  thumb_width: number;
  thumb_height: number;
  columns: number;
  rows: number;
  thumb_count: number;
  sheet_urls: string[];
}

export interface PlaybackPlan {
  session_id: string;
  item_id: string;
  mode: 'direct' | 'remux' | 'transcode';
  reason: string;
  video_copy?: boolean;
  audio_copy?: boolean;
  hw_accel?: string;
  stream_url: string;
  mime_type: string;
  audio_tracks: AudioTrack[];
  subtitles: SubtitleStream[];
  selected_audio_index?: number;
  selected_subtitle_index?: number;
  burn_subtitle_stream_index?: number;
  chapters?: ChapterInfo[];
  /** Skippable spans; older servers omit it (fall back to skippable chapters). */
  segments?: SkipSegment[];
  /** Scrubbing preview sprite sheets, present once maintenance has generated them. */
  trickplay?: TrickplayInfo;
  transcode_enabled: boolean;
  resume_position_ms: number;
  duration_ms: number;
  expires_at: string;
}

export interface PlaybackOptions {
  max_bitrate?: number;
  max_height?: number;
  audio_stream_index?: number;
  burn_subtitle_stream_index?: number;
  start_position_ms?: number;
  force_transcode?: boolean;
}

export interface AdminUser {
  id: string;
  username: string;
  display_name: string;
  role: 'admin' | 'member';
  disabled: boolean;
  all_libraries: boolean;
  library_ids: string[];
  can_request?: boolean;
  auto_approve_requests?: boolean;
  totp_enabled?: boolean;
  totp_required?: boolean;
  avatar_url?: string;
  active_sessions: number;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Invite {
  id: string;
  token_prefix: string;
  label?: string;
  role: 'admin' | 'member';
  all_libraries: boolean;
  require_totp?: boolean;
  library_ids: string[];
  max_uses: number;
  use_count: number;
  status: 'active' | 'expired' | 'exhausted' | 'revoked';
  created_by?: string;
  expires_at: string;
  revoked_at?: string;
  created_at: string;
}

export interface CreateInviteResponse {
  invite: Invite;
  token: string;
  invite_path: string;
}

export interface InviteInspect {
  valid: boolean;
  label?: string;
  role: 'admin' | 'member';
  all_libraries: boolean;
  require_totp?: boolean;
  remaining_uses: number;
  expires_at: string;
}

export interface ActiveStream {
  session_id: string;
  user_id: string;
  username: string;
  item_id: string;
  item_title: string;
  mode: string;
  hw_accel?: string;
  client_name: string;
  client_ip: string;
  started_at: string;
  last_seen_at: string;
}

export interface AuditEvent {
  id: number;
  event_type: string;
  actor_id?: string;
  client_ip: string;
  detail: string;
  created_at: string;
}

export interface SeriesSummary {
  library_id: string;
  library_kind?: Library['kind'];
  title: string;
  original_title?: string;
  year?: number;
  rating?: number;
  content_rating?: string;
  genres?: string[];
  overview?: string;
  video_width?: number;
  video_height?: number;
  video_hdr?: string;
  season_count: number;
  episode_count: number;
  dual_audio?: boolean;
  poster_url?: string;
  backdrop_url?: string;
  latest_added_at: string;
}

export interface SeriesEpisode {
  item: MediaItemSummary;
  progress?: PlaybackProgress;
}

export interface SeriesSeason {
  season_number: number;
  episodes: SeriesEpisode[];
}

export interface SeriesDetail {
  library_id: string;
  library_kind?: Library['kind'];
  representative_item_id?: string;
  title: string;
  original_title?: string;
  overview?: string;
  tagline?: string;
  year?: number;
  content_rating?: string;
  genres: string[];
  studios: string[];
  cast: CreditPerson[];
  tmdb_id?: string;
  imdb_id?: string;
  dual_audio?: boolean;
  poster_url?: string;
  backdrop_url?: string;
  season_count: number;
  episode_count: number;
  watched_count?: number;
  in_watchlist?: boolean;
  is_favorite?: boolean;
  next_up?: MediaItemSummary;
  seasons: SeriesSeason[];
}

export interface SimilarMediaResponse {
  items: MediaItemSummary[];
  series: SeriesSummary[];
}

export interface MetadataSearchResult {
  tmdb_id: string;
  kind: 'movie' | 'tv';
  title: string;
  original_title?: string;
  year?: number;
  overview?: string;
  poster_url?: string;
  rating?: number;
}

export type RequestStatus =
  | 'pending'
  | 'approved'
  | 'processing'
  | 'available'
  | 'declined'
  | 'failed';

export interface DiscoverItem {
  media_type: 'movie' | 'tv';
  tmdb_id: number;
  title: string;
  original_title?: string;
  year?: number;
  overview?: string;
  poster_url?: string;
  backdrop_url?: string;
  rating?: number;
  is_anime: boolean;
  in_library: boolean;
  library_item_id?: string;
  library_id?: string;
  library_series_title?: string;
  request_id?: string;
  request_status?: '' | RequestStatus;
}

export type DiscoverSort = 'popularity' | 'rating' | 'newest' | 'upcoming';

export interface DiscoverRequestFilter {
  sort?: DiscoverSort;
  genre?: number;
  year?: number;
  date_from?: string;
  date_to?: string;
  min_rating?: number;
  language?: string;
}

export interface DiscoverResponse {
  page: number;
  total_pages: number;
  results: DiscoverItem[];
}

export interface MediaRequest {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  media_type: 'movie' | 'tv';
  is_anime: boolean;
  tmdb_id: number;
  tvdb_id?: number;
  title: string;
  original_title?: string;
  year?: number;
  overview?: string;
  poster_url?: string;
  backdrop_url?: string;
  status: RequestStatus;
  status_note?: string;
  external_service?: string;
  external_id?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface MediaRequestsResponse {
  requests: MediaRequest[];
  pending_count: number;
}

export interface ArrInstanceConfig {
  enabled: boolean;
  url: string;
  api_key: string;
  has_api_key?: boolean;
  quality_profile_id: number;
  root_folder: string;
  anime_quality_profile_id?: number;
  anime_root_folder?: string;
  minimum_availability?: string;
  series_type?: string;
  season_folder?: boolean;
  search_on_add: boolean;
}

export interface RequestsConfig {
  enabled: boolean;
  tmdb_configured?: boolean;
  radarr: ArrInstanceConfig;
  radarr_anime: ArrInstanceConfig;
  sonarr: ArrInstanceConfig;
  sonarr_anime: ArrInstanceConfig;
}

export interface ArrTestResponse {
  ok: boolean;
  app_name?: string;
  version?: string;
  error?: string;
  quality_profiles?: { id: number; name: string }[];
  root_folders?: { path: string; free_space?: number }[];
}

export class ApiError extends Error {
  status: number;
  totpRequired: boolean;
  constructor(status: number, message: string, totpRequired = false) {
    super(message);
    this.status = status;
    this.totpRequired = totpRequired;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    let msg =
      typeof data === 'object' && data !== null && 'detail' in data && typeof (data as { detail: unknown }).detail === 'string'
        ? (data as { detail: string }).detail
        : typeof data === 'object' && data !== null && 'title' in data && typeof (data as { title: unknown }).title === 'string'
          ? (data as { title: string }).title
          : `Request failed (${res.status})`;
    if (
      typeof data === 'object' &&
      data !== null &&
      'errors' in data &&
      Array.isArray((data as { errors: unknown }).errors)
    ) {
      const details = (data as { errors: { location?: string; message?: string }[] }).errors
        .map((e) => (e.location ? `${e.location}: ${e.message ?? ''}` : e.message ?? ''))
        .filter(Boolean);
      if (details.length > 0) {
        msg = `${msg} (${details.join('; ')})`;
      }
    }
    const totpRequired = res.headers.get('X-Lune-TOTP-Required') === 'true';
    throw new ApiError(res.status, msg, totpRequired);
  }
  return data as T;
}

export const api = {
  getSystemInfo: () => request<SystemInfo>('/api/v1/system/info'),
  getHealth: () => request<HealthStatus>('/healthz'),

  setup: (body: { username: string; display_name?: string; password: string }) =>
    request<{ user: User }>('/api/v1/setup', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { username: string; password: string; totp_code?: string }) =>
    request<{ user: User }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ ...body, client_kind: 'web', client_name: 'Lune Web' }),
    }),

  logout: () => request<{ revoked: boolean }>('/api/v1/auth/logout', { method: 'POST' }),
  getMe: () => request<{ user: User; session: SessionInfo }>('/api/v1/auth/me'),
  getUserProfile: () => request<UserProfile>('/api/v1/users/me'),
  updateUserProfile: (body: { display_name?: string; preferences?: UserPreferences }) =>
    request<UserProfile>('/api/v1/users/me', { method: 'PATCH', body: JSON.stringify(body) }),
  changePassword: (body: { current_password: string; new_password: string }) =>
    request<{ changed: boolean }>('/api/v1/users/me/password', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  beginTOTPSetup: () =>
    request<TOTPSetupResponse>('/api/v1/users/me/totp/setup', { method: 'POST' }),
  enableTOTP: (body: { password: string; code: string }) =>
    request<TOTPEnableResponse>('/api/v1/users/me/totp/enable', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  disableTOTP: (body: { password: string; code: string }) =>
    request<{ enabled: boolean }>('/api/v1/users/me/totp/disable', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  revokeOtherSessions: () =>
    request<{ revoked_count: number }>('/api/v1/auth/sessions/revoke-others', { method: 'POST' }),

  approveDevice: (user_code: string) =>
    request<{ approved: boolean }>('/api/v1/auth/device/approve', {
      method: 'POST',
      body: JSON.stringify({ user_code }),
    }),

  inspectInvite: (token: string) =>
    request<InviteInspect>(`/api/v1/invites/${encodeURIComponent(token)}`),
  acceptInvite: (
    token: string,
    body: { username: string; display_name?: string; password: string },
  ) =>
    request<{ user: User }>(`/api/v1/invites/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      body: JSON.stringify({ ...body, client_kind: 'web', client_name: 'Lune Web' }),
    }),

  listLibraries: (signal?: AbortSignal) =>
    request<{ libraries: Library[] }>('/api/v1/libraries', signal ? { signal } : undefined),
  createLibrary: (body: { name: string; kind: Library['kind']; root_path: string }) =>
    request<Library>('/api/v1/libraries', { method: 'POST', body: JSON.stringify(body) }),
  deleteLibrary: (id: string) => request<void>(`/api/v1/libraries/${id}`, { method: 'DELETE' }),
  scanLibrary: (id: string, sync = false, force = false) => {
    const qs = new URLSearchParams();
    if (sync) qs.set('sync', 'true');
    if (force) qs.set('force', 'true');
    const qStr = qs.toString();
    return request<ScanStatus>(`/api/v1/libraries/${id}/scan${qStr ? `?${qStr}` : ''}`, { method: 'POST' });
  },
  getLibraryFacets: (libraryId: string, signal?: AbortSignal) =>
    request<LibraryFacets>(
      `/api/v1/libraries/${encodeURIComponent(libraryId)}/facets`,
      signal ? { signal } : undefined,
    ),

  listItems: (
    params?: LibraryFilters & {
      library_id?: string;
      kind?: string;
      q?: string;
      person?: string;
      studio?: string;
      sort?: SortOption;
      limit?: number;
      offset?: number;
    },
    signal?: AbortSignal,
  ) => {
    const qs = new URLSearchParams();
    if (params?.library_id) qs.set('library_id', params.library_id);
    if (params?.kind) qs.set('kind', params.kind);
    if (params?.q) qs.set('q', params.q);
    if (params?.genre) qs.set('genre', params.genre);
    if (params?.person) qs.set('person', params.person);
    if (params?.studio) qs.set('studio', params.studio);
    if (params?.content_rating) qs.set('content_rating', params.content_rating);
    if (params?.min_rating) qs.set('min_rating', String(params.min_rating));
    if (params?.year) qs.set('year', String(params.year));
    if (params?.decade) qs.set('decade', String(params.decade));
    if (params?.resolution) qs.set('resolution', params.resolution);
    if (params?.hdr) qs.set('hdr', 'true');
    if (params?.dual_audio) qs.set('dual_audio', 'true');
    if (params?.watched) qs.set('watched', params.watched);
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const qStr = qs.toString();
    return request<{ items: MediaItemSummary[]; total: number; limit?: number; offset?: number }>(
      `/api/v1/items${qStr ? `?${qStr}` : ''}`,
      signal ? { signal } : undefined,
    );
  },
  getItem: (id: string, signal?: AbortSignal) =>
    request<MediaItemDetail>(`/api/v1/items/${id}`, signal ? { signal } : undefined),
  getSimilarItems: (id: string, limit = 12, signal?: AbortSignal) =>
    request<SimilarMediaResponse>(
      `/api/v1/items/${id}/similar?limit=${limit}`,
      signal ? { signal } : undefined,
    ),
  createDirectLink: (id: string) =>
    request<DirectLink>(`/api/v1/items/${id}/direct-link`, { method: 'POST' }),
  searchMetadata: (params: { kind: 'movie' | 'tv'; q: string; year?: number }) => {
    const qs = new URLSearchParams({ kind: params.kind, q: params.q });
    if (params.year) qs.set('year', String(params.year));
    return request<{ configured: boolean; results: MetadataSearchResult[] }>(
      `/api/v1/metadata/search?${qs.toString()}`,
    );
  },
  refreshItem: (id: string, body?: { title?: string; year?: number; tmdb_id?: string }) =>
    request<MediaItemDetail>(`/api/v1/items/${id}/refresh`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  getNextEpisode: (id: string) => request<{ next_item?: MediaItemSummary }>(`/api/v1/items/${id}/next`),
  listWatchlist: (limit = 100, signal?: AbortSignal) =>
    request<{ items: MediaItemSummary[]; total: number }>(
      `/api/v1/users/me/watchlist?limit=${limit}`,
      signal ? { signal } : undefined,
    ),
  addToWatchlist: (id: string) =>
    request<{ item_id: string; in_watchlist?: boolean }>(`/api/v1/users/me/watchlist/${id}`, {
      method: 'PUT',
    }),
  removeFromWatchlist: (id: string) =>
    request<void>(`/api/v1/users/me/watchlist/${id}`, { method: 'DELETE' }),
  listFavorites: (limit = 100, signal?: AbortSignal) =>
    request<{ items: MediaItemSummary[]; total: number }>(
      `/api/v1/users/me/favorites?limit=${limit}`,
      signal ? { signal } : undefined,
    ),
  addToFavorites: (id: string) =>
    request<{ item_id: string; is_favorite?: boolean }>(`/api/v1/users/me/favorites/${id}`, {
      method: 'PUT',
    }),
  removeFromFavorites: (id: string) =>
    request<void>(`/api/v1/users/me/favorites/${id}`, { method: 'DELETE' }),

  listSeries: (
    params?: LibraryFilters & {
      library_id?: string;
      q?: string;
      person?: string;
      studio?: string;
      sort?: SortOption;
    },
    signal?: AbortSignal,
  ) => {
    const qs = new URLSearchParams();
    if (params?.library_id) qs.set('library_id', params.library_id);
    if (params?.q) qs.set('q', params.q);
    if (params?.genre) qs.set('genre', params.genre);
    if (params?.person) qs.set('person', params.person);
    if (params?.studio) qs.set('studio', params.studio);
    if (params?.content_rating) qs.set('content_rating', params.content_rating);
    if (params?.min_rating) qs.set('min_rating', String(params.min_rating));
    if (params?.year) qs.set('year', String(params.year));
    if (params?.decade) qs.set('decade', String(params.decade));
    if (params?.resolution) qs.set('resolution', params.resolution);
    if (params?.hdr) qs.set('hdr', 'true');
    if (params?.dual_audio) qs.set('dual_audio', 'true');
    if (params?.watched) qs.set('watched', params.watched);
    if (params?.sort) qs.set('sort', params.sort);
    const qStr = qs.toString();
    return request<{ series: SeriesSummary[] }>(
      `/api/v1/series${qStr ? `?${qStr}` : ''}`,
      signal ? { signal } : undefined,
    );
  },
  getSeriesDetail: (libraryId: string, title: string, signal?: AbortSignal) => {
    const qs = new URLSearchParams({ library_id: libraryId, title });
    return request<SeriesDetail>(
      `/api/v1/series/detail?${qs.toString()}`,
      signal ? { signal } : undefined,
    );
  },
  setSeriesWatched: (body: {
    library_id: string;
    title: string;
    season_number?: number;
    completed: boolean;
  }) =>
    request<{ updated: number }>('/api/v1/series/watched', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  refreshSeries: (body: {
    library_id: string;
    title: string;
    override_title?: string;
    override_year?: number;
    tmdb_id?: string;
  }) =>
    request<{ updated: number; title?: string }>('/api/v1/series/refresh', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  negotiatePlayback: (id: string, opts?: PlaybackOptions) => {
    const caps = detectBrowserCapabilities();
    return request<PlaybackPlan>(`/api/v1/items/${id}/playback`, {
      method: 'POST',
      body: JSON.stringify({ ...caps, ...opts, client_name: 'Lune Web' }),
    });
  },
  updateProgress: (id: string, position_ms: number, completed?: boolean, session_id?: string) =>
    request<PlaybackProgress>(`/api/v1/items/${id}/progress`, {
      method: 'PUT',
      body: JSON.stringify({
        position_ms,
        ...(completed !== undefined ? { completed } : {}),
        ...(session_id ? { session_id } : {}),
      }),
    }),
  clearProgress: (id: string) =>
    request<void>(`/api/v1/items/${id}/progress`, { method: 'DELETE' }),
  getContinueWatching: (signal?: AbortSignal) =>
    request<{ items: ContinueWatchingItem[] }>(
      '/api/v1/playback/continue',
      signal ? { signal } : undefined,
    ),
  getNextUp: (limit = 20, signal?: AbortSignal) =>
    request<NextUpResponse>(
      `/api/v1/playback/next-up?limit=${limit}`,
      signal ? { signal } : undefined,
    ),
  stopPlaybackSession: (sessionId: string) =>
    request<void>(`/api/v1/playback/sessions/${sessionId}`, {
      method: 'DELETE',
      keepalive: true,
    }),

  listActiveStreams: () => request<{ streams: ActiveStream[] }>('/api/v1/admin/streams'),
  listAuditEvents: (limit = 100) => request<{ events: AuditEvent[] }>(`/api/v1/admin/audit?limit=${limit}`),
  getDismissedAlerts: () => request<{ dismissed_ids: string[] }>('/api/v1/admin/alerts/dismissed'),
  dismissAlerts: (ids: string[]) =>
    request<{ dismissed_ids: string[] }>('/api/v1/admin/alerts/dismiss', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  listUsers: () => request<{ users: AdminUser[] }>('/api/v1/admin/users'),
  createUser: (body: {
    username: string;
    display_name?: string;
    password: string;
    role: 'admin' | 'member';
    all_libraries?: boolean;
    library_ids?: string[];
    totp_required?: boolean;
  }) => request<AdminUser>('/api/v1/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (
    id: string,
    body: {
      display_name?: string;
      role?: 'admin' | 'member';
      disabled?: boolean;
      password?: string;
      all_libraries?: boolean;
      library_ids?: string[];
      can_request?: boolean;
      auto_approve_requests?: boolean;
      totp_required?: boolean;
    },
  ) => request<AdminUser>(`/api/v1/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteUser: (id: string) => request<void>(`/api/v1/admin/users/${id}`, { method: 'DELETE' }),
  listUserSessions: (id: string) =>
    request<{ sessions: SessionInfo[] }>(`/api/v1/admin/users/${id}/sessions`),
  revokeUserSessions: (id: string) =>
    request<{ revoked_count: number }>(`/api/v1/admin/users/${id}/sessions`, { method: 'DELETE' }),

  listInvites: () => request<{ invites: Invite[] }>('/api/v1/admin/invites'),
  createInvite: (body: {
    label?: string;
    role?: 'admin' | 'member';
    all_libraries?: boolean;
    library_ids?: string[];
    require_totp?: boolean;
    max_uses?: number;
    expires_in_hours?: number;
  }) =>
    request<CreateInviteResponse>('/api/v1/admin/invites', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  revokeInvite: (id: string) => request<void>(`/api/v1/admin/invites/${id}`, { method: 'DELETE' }),
  clearInactiveInvites: () =>
    request<{ deleted: number }>('/api/v1/admin/invites', { method: 'DELETE' }),

  discoverRequests: (
    params: DiscoverRequestFilter & {
      tab?: 'trending' | 'movies' | 'tv' | 'anime';
      q?: string;
      page?: number;
    },
    signal?: AbortSignal,
  ) => {
    const qs = new URLSearchParams();
    if (params.tab) qs.set('tab', params.tab);
    if (params.q) qs.set('q', params.q);
    if (params.page && params.page > 1) qs.set('page', String(params.page));
    if (params.sort) qs.set('sort', params.sort);
    if (params.genre && params.genre > 0) qs.set('genre', String(params.genre));
    if (params.year && params.year > 0) qs.set('year', String(params.year));
    if (params.date_from) qs.set('date_from', params.date_from);
    if (params.date_to) qs.set('date_to', params.date_to);
    if (params.min_rating && params.min_rating > 0) qs.set('min_rating', String(params.min_rating));
    if (params.language) qs.set('language', params.language);
    const qStr = qs.toString();
    return request<DiscoverResponse>(
      `/api/v1/requests/discover${qStr ? `?${qStr}` : ''}`,
      signal ? { signal } : undefined,
    );
  },
  listRequests: (
    params?: { scope?: 'mine' | 'all'; status?: string; limit?: number },
    signal?: AbortSignal,
  ) => {
    const qs = new URLSearchParams();
    if (params?.scope) qs.set('scope', params.scope);
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    const qStr = qs.toString();
    return request<MediaRequestsResponse>(
      `/api/v1/requests${qStr ? `?${qStr}` : ''}`,
      signal ? { signal } : undefined,
    );
  },
  createRequest: (body: { media_type: 'movie' | 'tv'; tmdb_id: number; is_anime?: boolean }) =>
    request<MediaRequest>('/api/v1/requests', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteRequest: (id: string) =>
    request<{ deleted: boolean }>(`/api/v1/requests/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminApproveRequest: (id: string, body?: { is_anime?: boolean }) =>
    request<MediaRequest>(`/api/v1/admin/requests/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  adminDeclineRequest: (id: string, note?: string) =>
    request<MediaRequest>(`/api/v1/admin/requests/${encodeURIComponent(id)}/decline`, {
      method: 'POST',
      body: JSON.stringify(note ? { note } : {}),
    }),
  adminGetRequestsConfig: () => request<RequestsConfig>('/api/v1/admin/requests/config'),
  adminSaveRequestsConfig: (cfg: RequestsConfig) =>
    request<RequestsConfig>('/api/v1/admin/requests/config', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    }),
  adminTestArrConnection: (body: {
    service: 'radarr' | 'sonarr';
    slot?: 'radarr' | 'radarr_anime' | 'sonarr' | 'sonarr_anime';
    url: string;
    api_key: string;
  }) =>
    request<ArrTestResponse>('/api/v1/admin/requests/test', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  adminGetNetworkConfig: () => request<NetworkConfig>('/api/v1/admin/network/config'),
  adminSaveNetworkConfig: (cfg: NetworkConfig) =>
    request<NetworkConfig>('/api/v1/admin/network/config', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    }),
  adminListIPBans: () => request<{ bans: IPBan[] }>('/api/v1/admin/security/bans'),
  adminBanIP: (body: { ip: string; reason?: string; duration_minutes?: number }) =>
    request<{ ok: boolean }>('/api/v1/admin/security/bans', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  adminUnbanIP: (ip: string) =>
    request<{ ok: boolean }>(`/api/v1/admin/security/bans/${encodeURIComponent(ip)}`, {
      method: 'DELETE',
    }),
  adminResetUserTOTP: (userId: string) =>
    request<{ enabled: boolean }>(`/api/v1/admin/users/${encodeURIComponent(userId)}/totp`, {
      method: 'DELETE',
    }),

  adminGetStreamingConfig: () => request<StreamingConfig>('/api/v1/admin/streaming/config'),
  adminSaveStreamingConfig: (cfg: StreamingConfig) =>
    request<StreamingConfig>('/api/v1/admin/streaming/config', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    }),

  adminGetMaintenance: () => request<MaintenanceStatus>('/api/v1/admin/maintenance'),
  adminSaveMaintenanceConfig: (cfg: MaintenanceConfig) =>
    request<MaintenanceStatus>('/api/v1/admin/maintenance/config', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    }),
  adminRunMaintenance: (task?: MaintenanceTask) =>
    request<MaintenanceStatus>(
      task
        ? `/api/v1/admin/maintenance/run?task=${encodeURIComponent(task)}`
        : '/api/v1/admin/maintenance/run',
      {
        method: 'POST',
      },
    ),
  adminCancelMaintenance: () =>
    request<MaintenanceStatus>('/api/v1/admin/maintenance/cancel', {
      method: 'POST',
    }),
};

export function detectBrowserCapabilities() {
  const v = document.createElement('video');
  const containers: string[] = [];
  const video_codecs: string[] = [];
  const audio_codecs: string[] = [];

  // When MediaSource (MSE / hls.js) is available, fMP4 HLS remuxes go through MSE rather than
  // native <video>, so codecs that Lune may remux into fMP4 must be checked against MSE too.
  const hasMSE =
    typeof MediaSource !== 'undefined' && typeof MediaSource.isTypeSupported === 'function';

  const canPlayNative = (mime: string, strict = false): boolean => {
    const res = v.canPlayType(mime);
    return strict ? res === 'probably' : res === 'probably' || res === 'maybe';
  };

  const canPlayWithMSE = (mime: string, strict = false): boolean => {
    if (!canPlayNative(mime, strict)) return false;
    return hasMSE ? MediaSource.isTypeSupported(mime) : true;
  };

  if (canPlayNative('video/mp4')) containers.push('mp4', 'm4v');
  if (canPlayNative('video/webm')) containers.push('webm');
  if (canPlayNative('video/quicktime')) containers.push('mov');

  if (canPlayWithMSE('video/mp4; codecs="avc1.640028"')) video_codecs.push('h264');

  // Probe HEVC using hvc1 (Apple/fMP4-standard tag that Lune emits with -tag:v hvc1).
  // Require MSE support when MSE is active so hls.js remuxes don't fail on browsers whose
  // native <video> claims HEVC without MSE HEVC support.
  const hevc8 =
    canPlayWithMSE('video/mp4; codecs="hvc1.1.6.L120.90"', true) ||
    canPlayWithMSE('video/mp4; codecs="hvc1.1.6.L93.B0"', true);
  const hevc10 =
    canPlayWithMSE('video/mp4; codecs="hvc1.2.4.L120.90"', true) ||
    canPlayWithMSE('video/mp4; codecs="hvc1.2.4.L153.B0"', true);
  if (hevc8 || hevc10) video_codecs.push('hevc');

  if (canPlayNative('video/webm; codecs="vp9"')) video_codecs.push('vp9');
  if (canPlayWithMSE('video/mp4; codecs="av01.0.08M.08"')) video_codecs.push('av1');

  if (canPlayWithMSE('audio/mp4; codecs="mp4a.40.2"')) audio_codecs.push('aac');
  if (canPlayNative('audio/webm; codecs="opus"')) audio_codecs.push('opus');
  // Use strict 'probably' + MSE check for Dolby codecs to avoid silent Direct Play / remux
  // on browsers that return 'maybe' without a working AC-3/E-AC-3 decoder.
  if (canPlayWithMSE('audio/mp4; codecs="ec-3"', true)) audio_codecs.push('eac3');
  if (canPlayWithMSE('audio/mp4; codecs="ac-3"', true)) audio_codecs.push('ac3');
  if (canPlayNative('audio/mpeg')) audio_codecs.push('mp3');
  if (canPlayNative('audio/flac')) audio_codecs.push('flac');

  // Browsers do not reliably decode 10-bit H.264 (Hi10P, common in anime).
  const supports_10bit_h264 = false;
  const supports_10bit_hevc = hevc10;

  const displayHDR =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(dynamic-range: high)').matches
      : false;
  const supports_hdr = displayHDR && (supports_10bit_hevc || video_codecs.includes('av1'));

  // Only claim Dolby Vision when the display is HDR AND the browser reports 'probably'
  // (plus MSE support when MSE is active) for DoVi Profile 5, preventing green/purple
  // video on HDR10-only displays or browsers.
  const supports_dovi =
    supports_hdr && canPlayWithMSE('video/mp4; codecs="dvh1.05.06"', true);

  // Only advertise 5.1 (6ch) when Dolby surround decoding is supported; otherwise request
  // stereo (2ch) so FFmpeg cleanly downmixes 5.1/7.1 tracks instead of quiet/broken audio.
  const max_audio_channels =
    audio_codecs.includes('eac3') || audio_codecs.includes('ac3') ? 6 : 2;

  return {
    containers,
    video_codecs,
    audio_codecs,
    supports_10bit_h264,
    supports_10bit_hevc,
    supports_hdr,
    supports_dovi,
    max_audio_channels,
  };
}

export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

/** Time left, as "1h 12m left" / "42m left" / "45s left": whole minutes, matching the Apple TV client. */
export function formatTimeLeft(ms: number): string {
  if (!ms || ms <= 0) return '';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return `${Math.max(1, Math.floor(ms / 1000))}s left`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m left` : `${h}h left`;
  return `${m}m left`;
}

export function formatUptime(seconds: number): string {
  if (!seconds || seconds < 0) return '0s';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatResolution(width?: number, height?: number, includeSD = false): string {
  const w = width ?? 0;
  const h = height ?? 0;
  if (!w && !h) return '';
  if (w >= 3200 || h >= 2000) return '4K';
  if (w >= 1800 || h >= 1000) return '1080p';
  if (w >= 1200 || h >= 700) return '720p';
  if (includeSD) {
    if (w >= 640 || h >= 480) return '480p';
    if (h > 0) return `${h}p`;
  }
  return '';
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(val >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function normalizeLangCode(code?: string): string {
  const c = (code ?? '').trim().toLowerCase().split(/[-_]/)[0];
  switch (c) {
    case 'jpn':
    case 'ja':
    case 'jap':
    case 'japanese':
      return 'ja';
    case 'eng':
    case 'en':
    case 'english':
      return 'en';
    case 'fre':
    case 'fra':
    case 'fr':
      return 'fr';
    case 'spa':
    case 'es':
      return 'es';
    case 'ger':
    case 'deu':
    case 'de':
      return 'de';
    case 'kor':
    case 'ko':
      return 'ko';
    case 'zho':
    case 'chi':
    case 'zh':
      return 'zh';
    default:
      return c;
  }
}
