<div align="center">
  <br />
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/LuneServer/lune-brand/main/svg/lune-lockup-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/LuneServer/lune-brand/main/svg/lune-lockup-light.svg" />
    <img src="https://raw.githubusercontent.com/LuneServer/lune-brand/main/svg/lune-lockup-dark.svg" alt="Lune" width="216" />
  </picture>

  <p><strong>Official Web Client &amp; Admin Console for Lune</strong></p>
  <p>A calm, cinema-first web interface for browsing, watching, requesting, and managing your Lune media server.</p>

  <p>
    <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=09090B&labelColor=09090B" alt="React 19" height="20" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=F5F5F7&labelColor=09090B" alt="TypeScript" height="20" /></a>
    <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=F5F5F7&labelColor=09090B" alt="Vite 6" height="20" /></a>
    <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=F5F5F7&labelColor=09090B" alt="Tailwind CSS v4" height="20" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-F5F5F7?style=flat-square&labelColor=09090B" alt="AGPL-3.0 License" height="20" /></a>
  </p>

  <p>
    <a href="https://github.com/LuneServer/lune"><strong>Lune Server</strong></a> ·
    <a href="https://github.com/LuneServer/lune-brand"><strong>Brand &amp; Tokens</strong></a> ·
    <a href="https://github.com/LuneServer/unraid-templates"><strong>Unraid Template</strong></a> ·
    <a href="https://github.com/LuneServer/lune-web/issues"><strong>Issues</strong></a>
  </p>
</div>

---

## Features

- **Cinema-First Design** — Dark, Light, and Auto (Match Device) themes that keep your artwork front and center, with video playback always pinned to cinema-dark.
- **Full-Featured Theater Player** — Direct Play, Direct Stream, and hardware-accelerated streaming with quality/audio/subtitle/speed controls, playback stats, one-click Anime Sub/Dub switching, intro/outro skip, and Up Next countdown.
- **Polished Subtitles** — Fast-loading embedded and external subtitles with italics/formatting, live size and sync controls, letterbox-aware placement, and Picture-in-Picture support.
- **Fast Browsing & Discovery** — Full-bleed Movie, TV & Anime detail pages, instant Back/Forward navigation, library filters, Poster/List views, Watchlist & Favorites, and cast/genre discovery.
- **Built-In Requests & Admin Console** — Discover and request new media, manage libraries, users, invite links, 2FA, hardware transcoding diagnostics, networking, and maintenance from one place.

---

## Development

`lune-web` compiles to static HTML/JS/CSS in `dist/` and is served directly by [`LuneServer/lune`](https://github.com/LuneServer/lune) (no Node.js runtime needed in production).

### Run Locally

Start `lune` on `http://localhost:5863`, then launch the dev server:

```bash
npm install
npm run dev
```

### Production Build

```bash
npm run build
```

Serve the built bundle through Lune Server:

```bash
LUNE_WEB_DIR="$(pwd)/dist" go run -C ../lune ./cmd/lune
```

---

## License

Licensed under the [GNU Affero General Public License v3.0](LICENSE).
