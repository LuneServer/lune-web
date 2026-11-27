# AGENTS.md — `LuneServer/lune-web` (Web Client & Admin Console)

This document describes the architecture, conventions, and design invariants of **Lune Web** (`github.com/LuneServer/lune-web`) and how it integrates with Lune Server and Lune Brand.

> **Mandatory Branch Workflow:** Never commit directly to `main` or pile unrelated changes onto an existing branch. Start every distinct task (feature, fix, or doc change) on its own branch from an up-to-date local `main` (fetch and fast-forward `main` first, then `git switch -c <type>/<short-topic> main`, e.g. `feat/library-filters`; if local `main` cannot fast-forward to `origin/main` or has commits not on `origin/main`, use the freshly fetched `origin/main` as the start point instead). For parallel or concurrent work, or when the working tree already holds uncommitted changes from another task, use a separate worktree (`git worktree add ../lune-worktrees/<topic>/lune-web -b <type>/<topic> main`, substituting the freshly fetched `origin/main` as the base under the same fallback) instead of switching branches in place; for cross-repo tasks put all three worktrees under the same `../lune-worktrees/<topic>/` parent (`lune`, `lune-web`, `lune-brand`) so the `../lune`/`../lune-brand` paths below resolve to the task branches. Keep each branch scoped to one concern, run `git status` before editing to confirm what you're building on, and when a task spans repos (`lune`, `lune-web`, `lune-brand`), use a same-named branch in each. Do not merge, rebase onto, or push unless the user asks.

> **Mandatory Maintenance Rule:** Whenever you implement new functionality or change existing architecture (views, components, API client methods/types, playback capabilities, styling/tokens, routing, or build tooling), **you must update this `AGENTS.md` in the same change**. If you sync tokens or assets from `lune-brand` or rely on new backend endpoints in `lune`, verify those sibling repos and their `AGENTS.md` files stay aligned.

---

## 1. Lune Platform Ecosystem

| Repo | Local Path | Role |
|---|---|---|
| **`LuneServer/lune-web`** (this repo) | `../lune-web` | Official React 19 + TypeScript + Vite + Tailwind CSS v4 web client and admin console. Builds to static assets (`dist/`). |
| **`LuneServer/lune`** | `../lune` | Core Go media server. Exposes `/api/v1/*`, `/stream/*`, `/healthz`, `/openapi.json` and serves `lune-web/dist` directly via `LUNE_WEB_DIR`. |
| **`LuneServer/lune-brand`** | `../lune-brand` | Source of truth for Lune visual identity (`BRAND.md`), Horizon SVG/PNG marks, and design tokens (`tokens.css`, `tokens.json`). |

**Critical deployment constraint:** `lune-web` has **no Node.js runtime in production**. Everything must compile to static HTML/JS/CSS in `dist/` and work when served by `lune`'s `internal/web` SPA handler from the same origin as `/api/*` and `/stream/*`.

---

## 2. Technology Stack & Tooling

- **Runtime/UI:** React 19 (`react`, `react-dom`), TypeScript (`strict: true`), `lucide-react` icons
- **Build & Dev:** Vite 6 (`@vitejs/plugin-react`), Tailwind CSS v4 (`@tailwindcss/vite`)
- **Video Playback:** Native `<video>` element + `hls.js` for HLS remux/transcode streams
- **Typography:** Uniform neo-grotesque sans (`-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Inter', system-ui, sans-serif`) with `Inter` loaded via `index.html` and `tabular-nums` for metadata, badges, and durations; system monospace reserved for raw file paths, invite URLs, and admin audit data.

---

## 3. Repository Layout

```text
lune-web/
├── index.html                        # HTML shell, theme-color (#09090B), favicon, Google Fonts (Inter)
├── package.json                      # Scripts: dev, build (tsc -b && vite build), preview
├── tsconfig.json                     # Strict ES2022 + bundler moduleResolution
├── vite.config.ts                    # Vite + Tailwind v4 plugin; dev proxy to http://localhost:5863
├── public/
│   ├── favicon.svg                   # Synced from lune-brand/svg/lune-favicon.svg
│   ├── lune-mark.svg                 # Synced from lune-brand/svg/lune-mark.svg (dark UI)
│   ├── lune-mark-light.svg           # Synced from lune-brand/svg/lune-mark-light.svg (light UI)
│   └── theme-init.js                 # External anti-FOUC theme bootstrap (enables strict CSP script-src 'self')
└── src/
    ├── main.tsx                      # React root mount
    ├── tokens.css                    # Synced from lune-brand/tokens.css (--lune-* CSS variables for dark & light themes)
    ├── index.css                     # Tailwind v4 @import + @theme inline CSS-variable mappings + .lune-backdrop + .lune-poster-grid fluid auto-fill grid + theme mark switcher
    ├── lib/
    │   ├── api.ts                    # Typed fetch client (with AbortSignal support), API DTO interfaces, ApiError, codec detection, formatters (including width+height-aware formatResolution)
    │   ├── cache.ts                  # Bounded in-memory Stale-While-Revalidate cache (libraries, Home, My List, per-view grids, item/series details, similar items) with epoch-based invalidation
    │   ├── posterBadges.tsx          # React context & option registry for configurable poster overlay badges (default: none)
    │   └── theme.ts                  # Persistent Appearance hook (system default | light | dark in localStorage lune_theme_pref + matchMedia live sync + data-theme/theme-color)
    ├── App.tsx                       # App shell, session bootstrap, view state, responsive frosted top nav (desktop single-row + mobile scrollable nav strip, expandable search, and overflow account menu), Home/Library/Search views
    └── components/
        ├── AppLink.tsx               # Semantic SPA <a href> wrapper + route path helpers (enables native Right-Click -> Open in New Tab, Cmd/Middle-Click, and Copy Link)
        ├── LuneMark.tsx              # Theme-adaptive Horizon logo switcher (dark/light SVG)
        ├── ThemeSwitcher.tsx         # 3-way Appearance selector (Auto/System, Light, Dark) used in header, AuthScreen, and PreferencesModal
        ├── AuthScreen.tsx            # First-run admin setup (/api/v1/setup), login (/api/v1/auth/login) with TOTP 2FA / recovery code step, and invite acceptance (/invite/:token)
        ├── TotpEnrollmentScreen.tsx  # Forced 2FA QR enrollment & recovery code screen when an admin enforces totp_required on a user or invite
        ├── MediaCard.tsx             # 2:3 poster card with configurable poster badges (default: none; resolution/HDR/Dual Audio/rating) & continue-watching progress bar
        ├── SeriesCard.tsx            # 2:3 TV/Anime series card with configurable poster badges (default: none; seasons/resolution/HDR/Dual Audio/rating)
        ├── MediaListRow.tsx          # Horizontal list-view rows (MediaListRow & SeriesListRow) for Poster/List view switching
        ├── LibraryFilterBar.tsx      # Facet-driven library filter bar (genre, content rating, year, min rating, watched status, 4K/HDR/Dual Audio)
        ├── MediaShelf.tsx            # Horizontal scrolling home shelf with prev/next controls & edge fades
        ├── CastShelf.tsx             # Horizontal cast portrait shelf with lazy-cached person headshots, automatic retry, monogram fallback, and click-to-discover
        ├── IdentifyModal.tsx         # Admin visual TMDB Identify & Re-Match modal (search candidates with poster/year/overview/TMDB ID and bind exact ID)
        ├── MediaInfoModal.tsx        # Frosted technical Media Info sheet (container, bitrate, file size, release group, admin file path, video/audio/subtitle streams)
        ├── SeriesDetailPage.tsx      # Full-bleed series detail page: Anime/TV eyebrow, synopsis, watchlist/favorite/mark-watched toggles, admin cog (refresh/re-match series), clickable genres/studios/cast, season & Specials/OVAs tabs with bulk mark watched, episode list with progress, Next Up, and local More Like This shelf
        ├── ItemDetailPage.tsx        # Full-bleed item detail page: resume/start-over/watched state, pre-play audio & subtitle pickers, user ⋯ menu (Media Info, Download Original, Copy Stream URL, Reset Progress), admin ⚙ cog (Refresh & Re-Match), clickable series breadcrumb & Prev/Next + More from Season shelf, clickable chapters (16:9 chapter still shelf when thumbnails exist, compact pill row fallback), clickable genres/credits/cast, and local More Like This shelf
        ├── TheaterPlayer.tsx         # Full-viewport player: Direct Play / hls.js, quality/audio/subtitle/speed/chapters menus with 16:9 chapter stills, scrubber hover preview (trickplay sprite-sheet tile from `plan.trickplay` (AVIF/WebP/JPEG; tile chosen by binary search over `timestamps_ms` when the server de-duplicated tiles, else `floor(ms / interval_ms)`) via CSS background positioning, all sheets preloaded on first scrub, falling back to chapter stills / timestamp bubble when absent or broken), quick Sub/Dub toggle, Skip Opening/Ending/Recap pill & chapter ticks, embedded+sidecar WebVTT cue renderer, stats overlay, progress sync, Up Next countdown
        ├── PreferencesModal.tsx      # User playback & UI preferences modal: one-click Anime Subbed/Dubbed presets, default audio/subtitle language, subtitles toggle, autoplay next, combine Next Up toggle, configurable poster badges (default: none), and TOTP 2FA enrollment/recovery codes
        ├── RequestsPage.tsx          # User-facing Media Requests & Discover page (/requests): TMDB discovery/search with Seerr-style filters (sort, genre, year, min score, language, Not in Library toggle), frosted request confirmation modal, My Requests & admin All Requests tabs (neutral App Store-compliant UX)
        ├── DevicePair.tsx            # RFC 8628 TV/mobile device pairing code approval
        ├── AdminConsole.tsx          # Category-routed admin console shell (/console, /console/libraries, /console/requests, /console/users, /console/invites, /console/playback, /console/network, /console/maintenance, /console/activity)
        └── console/
            ├── ConsoleOverview.tsx   # Console home: server/library stats, system alerts, live active playbacks (with stop), and recent activity feed
            ├── ConsoleLibraries.tsx  # Library registration (movies/shows/anime/music/other), incremental/force scans, metadata refresh, deletion, and an expandable scan-error panel (per-file path + reason from `scan.error_samples` / `last_error`)
            ├── ConsoleRequests.tsx   # Admin Requests Queue (approve, decline with note, retry, delete) & Radarr/Sonarr (+ optional Anime instances) integration settings with connection test and profile/root-folder loaders
            ├── ConsoleUsers.tsx      # Multi-user accounts, roles, per-user library ACLs, request/auto-approve permissions, session inspection/revocation, password reset, enable/disable, delete
            ├── ConsoleInvites.tsx    # Expiring invite link creation (with role/library scoping & canonical public_url origin), one-time link copy, and revocation
            ├── ConsolePlayback.tsx   # Hardware transcoding & FFmpeg probe diagnostics (`transcoder` status, HW accel backend, render device, HDR/DoVi tone-mapping) + live playback & transcoding limits settings (server-wide & per-user concurrent transcode caps, idle transcode timeout)
            ├── ConsoleNetwork.tsx    # Access mode & networking settings (Entirely Local, Built-in ACME HTTPS + Cloudflare DNS-01, Reverse Proxy, Tailscale), LAN-only Admin Console switch, IP allowlist/blocklist, and active IP ban management
            ├── ConsoleMaintenance.tsx # Periodic housekeeping status, last-run metrics (including chapter stills generated/unreadable, "Resumed" passes, and an auto-resume notice while `chapters_resume_pending`), manual "Run Maintenance Now", and live-editable schedule/task retention, chapter stills & Scrubbing Previews (trickplay toggle, interval, thumbnail width, per-task Run) settings
            ├── ConsoleActivity.tsx   # Searchable & filterable security/activity audit log
            └── auditUtils.ts         # Shared audit event categorization and alert detection helpers
```

---

## 4. Application Architecture & Data Flow

### Authentication & Session Bootstrap (`App.tsx`, `AuthScreen.tsx`, `src/lib/api.ts`)
- All API calls go through `request<T>()` in `src/lib/api.ts` using `credentials: 'include'` so the browser sends `lune`'s `HttpOnly` `lune_session` cookie automatically.
- On startup, `App.tsx` calls `GET /api/v1/system/info`:
  - If `setup_required` is `true`, `AuthScreen` renders initial administrator setup (`POST /api/v1/setup`).
  - Otherwise, it calls `GET /api/v1/auth/me` to hydrate the current user or show the sign-in screen (`POST /api/v1/auth/login` with `client_kind: 'web'`).
- Admin-only UI (Console button, `AdminConsole`, metadata re-match in `PlayerModal`) is gated on `user.role === 'admin'` (server also enforces 403).

### Navigation & View Architecture (`App.tsx`)
- Current navigation is managed via discriminated-union `View` state in `App.tsx`:
  - `{ kind: 'home' }` — Horizontal scrolling Continue Watching shelf (by default combined & deduplicated with `/api/v1/playback/next-up` sorted by recent activity, or split into separate Continue Watching and Next Up shelves when `combine_next_up` is disabled; inline `×` removal via `DELETE /api/v1/items/{id}/progress` for in-progress items), My Watchlist shelf (when non-empty, with inline `×` removal), and "Recently Added in \<Library\>" shelves (up to 15 items inline; `shows` render `SeriesCard`, `anime` renders both `SeriesCard` and standalone anime film `MediaCard`, other libraries render `MediaCard` excluding raw episodes)
  - `{ kind: 'mylist'; tab: 'watchlist' | 'favorites' }` — Dedicated personal Watchlist & Favorites view (`/my-list`, `/my-list/favorites`) with tab counts, Poster/List view toggle, and inline `×` removal
  - `{ kind: 'requests' }` — Native Media Requests & Discover page (`/requests`), shown in the top nav bar only when `systemInfo.requests_enabled` is `true` and the user is permitted (`user.role === 'admin' || user.can_request !== false`)
  - `{ kind: 'recent'; libraryId: string }` — Focused "Recently Added" view (`/libraries/:id/recent`) capped at the latest 30 additions with Poster/List view toggle
  - `{ kind: 'discover'; filterKind: 'genre' | 'person' | 'studio'; value: string }` — Local library discovery view (`/discover/:kind/:value`) triggered by clicking genres, studios, directors, writers, or cast portraits, with sort and Poster/List view toggle
  - `{ kind: 'library'; libraryId: string }` — Dedicated library browse view defaulting to `title` (A–Z) with facet-driven `LibraryFilterBar` (genre, content rating, year, min rating, watched status, 4K/HDR/Dual Audio), Poster/List view toggle (`localStorage` `lune_view_mode`), Favorites filter toggle, sort selector (`title`, `recent`, `year`, `rating`), and `All` / `Series` / `Films` filter pills for `anime` libraries containing both series and films
  - `{ kind: 'pair' }` — RFC 8628 device code approval (`DevicePair`)
  - `{ kind: 'console'; section: ConsoleSection }` — Category-routed admin console (`/console` Overview, `/console/libraries`, `/console/requests`, `/console/users`, `/console/invites`, `/console/playback`, `/console/network`, `/console/activity`)
  - `{ kind: 'series'; libraryId: string; title: string }` — Full-bleed TV series page (`/series/:libraryId/:title`)
  - `{ kind: 'item'; itemId: string }` — Full-bleed media item page (`/items/:id`)
  - `{ kind: 'watch'; itemId: string }` — Routed full-viewport media player page (`/watch/:id`) so browser Refresh stays in the player and Back returns cleanly to the item/series page
- Unauthenticated `/invite/:token` URLs route to `AuthScreen` in invite-acceptance mode (`GET /api/v1/invites/{token}` + `POST /api/v1/invites/{token}/accept`).
- Global/scoped search in the header dynamically overrides Home and Library views while preserving the active library scope.
- Instant Back/Forward navigation: `App.tsx` tracks per-history-entry scroll positions (`scrollRestoration = 'manual'`), cancels superseded in-flight fetches with `AbortController`, and hydrates Home, My List, Library/Recent/Discover views, `ItemDetailPage`, and `SeriesDetailPage` synchronously from `src/lib/cache.ts` (stale-while-revalidate with epoch invalidation on mutations) while `CastShelf` uses `loading="lazy"` / `decoding="async"` with automatic transient-error retries so person headshots recover cleanly across rapid back/forward navigation.
- Overlays (`SeriesModal`, `PlayerModal`, `TheaterPlayer`) sit above the main view; the top header remains visible above `TheaterPlayer`.

### Playback Architecture (`TheaterPlayer.tsx`, `src/lib/api.ts`)
- `detectBrowserCapabilities()` probes `<video>.canPlayType(...)` alongside `MediaSource.isTypeSupported(...)` (when MSE/`hls.js` is active) and `matchMedia('(dynamic-range: high)')` for containers (`mp4`, `m4v`, `webm`, `mov`), video codecs (`h264`, `hevc` 8/10-bit via `hvc1`, `vp9`, `av1`), audio codecs (`aac`, `opus`, strict `probably`+MSE `eac3`/`ac3`, `mp3`, `flac`), HDR10/Dolby Vision display+decode support (avoiding false DoVi claims on HDR10-only/SDR displays), and max audio channels (6ch only when Dolby surround is supported, else 2ch).
- `api.negotiatePlayback(itemId, opts)` calls `POST /api/v1/items/{id}/playback` and receives a `PlaybackPlan` (`mode: 'direct' | 'remux' | 'transcode'`, `video_copy`, `audio_copy`, `hw_accel`, signed `stream_url`, `audio_tracks`, `subtitles` including bitmap burn-in tracks, `resume_position_ms`). Pre-play bitmap burn-in subtitle selection on `ItemDetailPage` passes `burnSubtitleStreamIndex` into `TheaterPlayer`.
- Direct Play sets `video.src` directly with automatic one-shot fallback to transcode if the browser fails to decode, stalls before `loadedmetadata`, or decodes video-only with silent/unsupported audio; fMP4 HLS (`remux` / `transcode`) attaches via `hls.js` (180 MB buffer headroom, 120s back-buffer, `maxBufferHole`/`nudgeOffset` gap handling, 60s fragment timeout, bounded network retry with HTTP status-aware errors, `swapAudioCodec` media recovery) or native HLS on Safari.
- `TheaterPlayer` tracks HLS seek offsets (`streamOffsetSec`) so timeline display, progress sync, WebVTT subtitle cues, and chapter skip markers stay synced to absolute media time, tears down outgoing `hls.js` sessions before renegotiation (preventing stale error flashes), uses a frosted buffer spinner for loading/buffering, preserves autoplay intent across rapid seeks, exposes detailed Playback Telemetry (including clear `Direct Play` / `Direct Stream` / `Direct Stream · Audio Transcode` / `Transcode` mode labels; no mode pill in the top OSD bar).
- Previous transcode/playback sessions are stopped cleanly via `DELETE /api/v1/playback/sessions/{id}` on renegotiation (seek/quality/audio/burn-in change) or player close.
- Text subtitles stream progressively as WebVTT from signed `/stream/sub/...` URLs (with `?start=<sec>` fast seeking for embedded MKV tracks), render safely formatted `<i>`/`<b>`/`<u>` cues positioned cleanly inside the active letterboxed video frame with persisted size (`sm`/`md`/`lg`) and sync offset, and mirror to a hidden native `TextTrack` only while in Picture-in-Picture; bitmap PGS/VobSub tracks trigger server-side burn-in when explicitly selected.
- Watch progress syncs periodically to `PUT /api/v1/items/{id}/progress`; near completion, `GET /api/v1/items/{id}/next` drives the Up Next auto-advance countdown, and `navigator.mediaSession` exposes OS media key controls.

### API Contract Alignment
- `src/lib/api.ts` currently holds hand-maintained TypeScript interfaces and endpoint wrappers mirroring `lune`'s OpenAPI 3.1 contract (`/openapi.json`).
- **Rule:** Never invent or drift field names. Always verify request/response shapes against `../lune/internal/api/*.go` (or `/openapi.json`). If `openapi-typescript` codegen is introduced later, update this section immediately.

---

## 5. Visual Design & Brand Rules

Follow `../lune-brand/BRAND.md` strictly:
- **Aesthetic & Themes:** Calm, cinema-first minimalism — supports **Auto (Match Device)** (`prefers-color-scheme`, default), **Dark** (`#09090B`), and **Light** (`#F5F5F7`) via `useTheme` (`src/lib/theme.ts`), `<ThemeSwitcher />`, and anti-FOUC bootstrap in `index.html`. `TheaterPlayer` explicitly pins `data-theme="dark"` so video playback stays cinema-dark even in Light Mode. Frosted translucency (`backdrop-blur-xl backdrop-saturate-150`) is used selectively on the sticky header, floating detail controls, modals, and player OSD menus.
- **Tokens:** Use `--lune-*` tokens from `src/tokens.css` and Tailwind v4 semantic `@theme inline` utilities from `src/index.css` (`canvas`, `surface`, `elevated`, `hairline`, `tone`, `ink`, `ink-secondary`, `ink-muted`, `accent`, `accent-hover`, `on-accent`, `telemetry`, `healthy`, `warning`, `danger`). Use `tone` (white in dark mode, `#1D1D1F` in light mode) for translucent UI borders, pills, and dividers; reserve literal `white`/`black` for overlays directly atop video or poster artwork.
- **Contrast:** Primary CTA buttons using Pure White (`bg-accent`, `#FFFFFF`) must use Obsidian ink (`text-on-accent`, `#09090B`) for AAA contrast.
- **Typography:** Uniform sans-serif (`SF Pro` / `Inter`) with `tabular-nums` across headings, UI, badges (`4K`, `HDR`, `DUAL`), durations, and media specs; reserve `font-mono` strictly for raw paths, invite URLs, IPs, and audit payloads in the Admin Console.
- **Logo hygiene:** Use `/lune-mark.svg` and `/favicon.svg` as-is from `lune-brand`; do not rotate the mark, add glow drop-shadows to the wordmark, or combine with film/play-button clichés.
- **Token/asset sync:** Never diverge `src/tokens.css` or `public/*.svg` from `../lune-brand` without updating `lune-brand` first.

---

## 6. Development & Verification Commands

Local development (requires `lune` running on `http://localhost:5863`, proxied by `vite.config.ts`):

```bash
npm install
npm run dev
```

Type-check and production build (run before concluding any change):

```bash
npm run build
```

Test the production bundle served directly by Lune Server:

```bash
LUNE_WEB_DIR="$(pwd)/dist" go run -C ../lune ./cmd/lune
```

---

## 7. Keeping Documentation Up to Date

When implementing new functionality in `lune-web`, update:
1. **This file (`AGENTS.md`):** Keep the file tree, component responsibilities, view/routing model, playback capabilities, API client strategy, and commands accurate.
2. **Backend contract (`../lune`):** If a UI feature requires new endpoints or DTO fields, keep `src/lib/api.ts` in lockstep with `../lune/internal/api/` and update `../lune/AGENTS.md` when backend behavior changes. Make those edits on the same-named branch in `../lune` (or in the matching worktree when that checkout has uncommitted changes from another task), never on whatever branch happens to be checked out there.
3. **Brand assets (`../lune-brand`):** If new semantic colors, radii, or icon variants are needed, add them to `../lune-brand` first and sync back into `lune-web`. Do this on the same-named branch in `../lune-brand` (or in the matching worktree when that checkout has uncommitted changes from another task), never on whatever branch happens to be checked out there.
