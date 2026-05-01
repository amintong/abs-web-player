# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## Project Overview

iOS-first PWA audiobook player (Audiobookshelf frontend). Pure client-side architecture — all API calls go directly to an Audiobookshelf server (requires CORS). Tech stack: **React 19 + TypeScript + Vite 6 + Zustand 5 + React Router 7 + Tailwind CSS 3**.

## Common Commands

```bash
npm run dev          # Start dev server (port 5173, LAN-accessible)
npm run build        # Type-check (tsc -b) then Vite production build
npm run lint         # ESLint
npm run preview      # Preview production build locally
npx playwright test  # Run e2e tests
npx playwright test e2e/playback.spec.ts  # Run single test file
```

**Version**: Must update `public/VERSION` before every push to main. This is consumed by `vite.config.ts` as `__APP_VERSION__`.

## Architecture

### Core Pattern: Single Audio Instance + Zustand Store

The entire audio playback engine lives in one file: **`src/store/playerStore.ts`** (~780 lines). It manages a singleton `HTMLAudioElement`, chapter switching, intro/outro skip, progress sync, sleep timer, and background/foreground recovery. All other components read state from this store or directly from the audio element.

### Key Design Decisions

1. **`currentTime` is NOT in the store** — it's read at 60fps via `useAudioTime()` hook (`src/hooks/useAudioTime.ts`) directly from the audio DOM element, avoiding global re-renders on every frame.

2. **Watchdog uses `setInterval(1000ms)` only** — not `timeupdate` events. This ensures identical behavior in foreground, background, and iOS lock-screen states. The interval handles: intro auto-skip, outro auto-chapter-switch, and natural end-of-chapter detection.

3. **Session mechanism** — `sessionStorage` holds current playback position (24h expiry). Used for lock-screen recovery and page refresh restore. A **restore token counter** (`restoreGen`) prevents stale async `play()` callbacks from overriding user actions after foreground return.

4. **Audio cache** — `AudioCache` singleton (`src/utils/audioCache.ts`), LRU eviction, ~300MB cap. Downloads audio as Blob → ObjectURL for playback. Prefetches next 3 chapters on load.

5. **Three-level config system** — `ConfigManager` (`src/utils/configManager.ts`) stores settings in localStorage under key `abs-config`:
   - **App level**: skip seconds, dark mode defaults
   - **Book level**: per-book introSeconds/outroSeconds/autoSkipIntro/autoSkipOutro
   - **Player level**: volume, playbackRate

### State Management

| Store | File | Persistence |
|-------|------|-------------|
| `usePlayerStore` | `store/playerStore.ts` | None (runtime only) |
| `useAppStore` | `store/appStore.ts` | Zustand persist (`abs-app-storage`) |
| Skip settings | `store/skipSettingsStore.ts` | Delegates to ConfigManager |

### Route Structure (defined inline in `App.tsx`)

```
/                → HomePage       (continue listening / recently added)
/library/:id     → LibraryPage    (book list per library)
/item/:itemId    → ItemDetailPage (book detail + chapter list)
/player          → PlayerPage     (active playback view)
/search          → SearchPage
/settings        → SettingsPage
*                → Redirect to /
```

All routes are wrapped in `DebugTag` (dev-only). Unauthenticated users see `LoginPage`. Login supports manual server+user/pass or ENV-based auto-login (`VITE_ABS_SERVER` / `VITE_ABS_TOKEN`).

### iOS-Specific Handling

This project targets iOS PWA heavily. Critical patterns:

- **Viewport height**: `main.tsx` sets `document.documentElement.style.height = window.screen.height` because `innerHeight`/`visualViewport.height` exclude safe-area on iOS PWA with `viewport-fit=cover`.
- **Safe area CSS variables**: Set in `index.css` as `--sat` / `--sab`, bridged from `env(safe-area-inset-*)`.
- **Lock screen recovery**: `visibilitychange` handler detects when iOS pauses audio, calls `audio.play()`, checks for currentTime reset to 0 (restores from session).
- **MediaSession API**: `useMediaSession.ts` hook registers lock-screen media controls (play/pause/skip).

### File Dependency Graph (key files)

```
main.tsx
  └→ App.tsx (router + auth guard + hydration)
       ├→ pages/* (consume usePlayerStore, useAppStore)
       ├→ components/
       │   ├→ MiniPlayer.tsx (bottom bar, always visible)
       │   ├→ FullPlayer.tsx (expanded player view)
       │   ├→ Slider.tsx (custom range input)
       │   └→ SlideUpPanel.tsx (bottom sheet)
       └→ hooks/
           ├→ useAudioTime.ts (rAF reads audio.currentTime)
           └→ useMediaSession.ts (lock screen controls)

playerStore.ts (core engine)
  ├→ api/audiobookshelf.ts (ABS REST client, CORS direct)
  ├→ utils/audioCache.ts (Blob LRU cache)
  ├→ utils/configManager.ts (3-level settings)
  └── utils/playerLogger.ts (ring buffer, 500 entries)
```

### API Layer (`src/api/audiobookshelf.ts`)

All requests go directly to user's Audiobookshelf server. Token stored in `localStorage('abs_token')`, server URL in `localStorage('abs_server')` or env `VITE_ABS_SERVER`. Audio URLs include `?token=` query param for auth. Progress sync uses `sendBeacon` for reliability on page close.

### E2E Tests

Playwright-based tests in `e2e/`. Key test files:
- `smoke.spec.ts` — basic route loading + login flow
- `playback.spec.ts` — playback controls, chapter navigation
- `integration.spec.ts` — cross-page flows

### Important Conventions

- **No `timeupdate` events for watchdog** — use `setInterval` exclusively for chapter management logic.
- **Always call `cleanupWatchdog()` before setting new `audio.src`** in `loadChapterInternal` to prevent listener accumulation.
- **`setupChapterWatchdog()` must be called after audio readyState >= 3 or timeout** — never assume audio is immediately playable after `src` assignment.
- **When modifying playerStore, consider iOS lock-screen behavior changes** — most bugs here stem from differences between foreground/background execution.
