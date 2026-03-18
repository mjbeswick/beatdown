# Plan: Reel — Electrobun Migration + Full Feature Overhaul

## TL;DR
Migrate from Express+Socket.IO+Vite to **Electrobun** (Bun runtime + native webview), restructure file storage with deduplication, add a full audio player with queue, butterchurn visualizer, enhanced context menus, interactive views, keyboard shortcuts, lyrics, reconnection UI, search, and more. The Electrobun migration eliminates the client/server split and replaces Socket.IO IPC with Electrobun's native RPC.

---

## Phase 0: Electrobun Migration (Foundation)

**Why**: Electrobun gives us Bun as runtime (faster than Node), native macOS webview (smaller bundle, no Chromium), built-in IPC/RPC (no Socket.IO or Express needed), native context menus, native app menus, built-in updater, code signing, and ~14MB bundle size.

### Steps

1. **Initialize Electrobun project structure**
   - Run `bunx electrobun init`, then restructure into:
     ```
     reel/
       src/
         bun/              # Main Bun process (replaces server/)
           index.ts        # Electrobun entry: BrowserWindow creation, IPC handlers
           services/       # Moved from server/src/services/
             downloader.ts
             playlist.ts
             queue.ts
             spotify.ts
           types.ts
           logger.ts
         views/
           main/           # React app (replaces client/)
             index.html
             src/           # All client source files
       electrobun.config.ts
       package.json
     ```
   - Single `package.json` at root — no more workspaces

2. **Replace Express + Socket.IO with Electrobun RPC**
   - Remove `express`, `socket.io`, `socket.io-client`, `cors` dependencies
   - Main Bun process (`src/bun/index.ts`):
     - Create `BrowserWindow` with `url: "views://main/index.html"`
     - Define RPC handlers: `download:add`, `download:remove`, `track:remove`, `download:redownload`, `downloads:getAll`
     - Push updates to webview via Electrobun's postMessage/RPC when queue emits events
   - Client side (`src/views/main/src/`):
     - Replace `socket/client.ts` with Electrobun's browser-side RPC (`Electroview` class)
     - Effector stores receive updates via RPC instead of Socket.IO events
     - Import from `electrobun/browser` instead of `socket.io-client`

3. **Replace Vite with Electrobun bundler**
   - Remove `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite` from deps
   - Configure `electrobun.config.ts` with view entrypoint pointing to the React app
   - Tailwind CSS: switch to PostCSS-based build or Tailwind CLI (since no Vite plugin)
   - Keep React, Effector, lucide-react as dependencies

4. **Replace HTTP streaming with local file access**
   - Current: `/api/stream/:downloadId/:trackId` via Express with range requests
   - New: Expose a Bun-native HTTP server on localhost (Bun.serve) for audio streaming, OR use `file://` URLs passed via RPC
   - Recommendation: Keep a minimal `Bun.serve()` on a random port for streaming since HTMLAudioElement needs a URL — pass the URL to the webview via RPC
   - Alternatively: use Electrobun's native file access to read audio and pass base64/blob (less efficient for large files)

5. **Use native context menus**
   - Replace custom `ContextMenu.tsx` portal component with Electrobun's native `ContextMenu` API
   - This gives OS-native look and feel
   - Keep the custom component as fallback or for more complex menus

6. **Configure build & dev workflow**
   - `electrobun.config.ts`: define bun entrypoint, view paths, app name "Reel", icons
   - `bun start` → dev build with hot reload
   - `bun run build` → production bundle

**Key files to migrate:**
- `server/src/index.ts` → `src/bun/index.ts` (Express→Electrobun BrowserWindow + RPC)
- `server/src/services/*` → `src/bun/services/*` (unchanged logic, Bun-compatible)
- `server/src/types.ts` + `client/src/types.ts` → `src/shared/types.ts` (single source of truth)
- `client/src/*` → `src/views/main/src/*` (React app, replace socket with RPC)
- `client/index.html` → `src/views/main/index.html`

**Dependencies change:**
- Remove: `express`, `socket.io`, `socket.io-client`, `cors`, `vite`, `@vitejs/plugin-react`, `concurrently`
- Add: `electrobun`
- Keep: `react`, `react-dom`, `effector`, `effector-react`, `lucide-react`, `axios`, `cheerio`, `uuid`, `tailwindcss`, `typescript`

---

## Phase 1: File Storage Reorganization & Deduplication

### Steps

7. **Restructure output directory layout**
   - Change from `~/Music/Reel/{PlaylistName}/` to:
     - `~/Music/Reel/Library/{Artist}/{track}.{ext}` — shared track storage
     - `~/Music/Reel/Playlists/{Name}.m3u` — playlist files with relative paths
   - Modify `queue.ts` `outputDir` construction
   - Modify `downloader.ts` `outputTemplate` to target `Library/{artist}/`
   - Modify `playlist.ts` to save .m3u in `Playlists/`, use relative paths (`../Library/...`)

8. **Add track deduplication**
   - In `queue.ts` `runTrack()`, before downloading, check `Library/{artist}/` for matching file
   - If found: skip download, set `filePath`, mark as done immediately
   - Add `findExistingTrack(artist, title, format)` helper in `downloader.ts`

9. **Migration util**
   - On first `loadFromDisk()`, detect old layout and move files to new structure

---

## Phase 2: Audio Player

### Steps

10. **Player store** — `src/views/main/src/stores/player.ts` (Effector)
    - State: `currentTrack` (TrackInfo + downloadId + coverArt + albumName), `queue[]`, `queueIndex`, `isPlaying`, `volume`, `currentTime`, `duration`, `shuffle`, `repeat` ('off'|'one'|'all')
    - Events: `play`, `playPlaylist`, `enqueue`, `playNext`, `pause`, `resume`, `next`, `prev`, `seek`, `setVolume`, `toggleShuffle`, `toggleRepeat`
    - Persist volume/shuffle/repeat to localStorage

11. **Audio engine** — `src/views/main/src/audio/engine.ts`
    - HTMLAudioElement + Web Audio API (AudioContext → MediaElementSource → AnalyserNode → destination)
    - `src` = streaming URL from Bun.serve
    - Exposes `getAnalyserNode()` for butterchurn
    - `ended` → auto-advance (shuffle/repeat aware)
    - AudioContext created on first user gesture

12. **PlayerPanel component** — `src/views/main/src/components/PlayerPanel.tsx`
    - Fixed bar at bottom, hidden when nothing playing
    - Left: album art (64×64) + title + artist (click to go to album)
    - Center: Shuffle / Prev / Play|Pause / Next / Repeat + seeker with timestamps
    - Right: volume slider
    - Icons: `Play`, `Pause`, `SkipBack`, `SkipForward`, `Shuffle`, `Repeat`, `Repeat1`, `Volume2`, `VolumeX`

13. **Waveform seeker** (optional enhancement)
    - Render small waveform in seeker bar using `decodeAudioData` from Web Audio API
    - Lightweight overlay on the progress track

---

## Phase 3: Playback Integration & Context Menus

### Steps

14. **Make tracks playable**
    - Click completed track in TrackRow → play + queue entire parent playlist/album
    - Play button on hover for completed DownloadRow items

15. **Enhanced context menus** (native Electrobun or custom)
    - TrackRow: Play, Play Next, Add to Queue | Go to Album, Go to Artist | Delete
    - DownloadRow: Play All, Enqueue All | Re-download | Remove
    - ArtistsView tracks: Play, Enqueue, Go to Album

16. **Navigation from context menus**
    - `navToAlbum(downloadId)` and `navToArtist(artist)` in nav store
    - Switch view, expand/filter to target

---

## Phase 4: Albums View, Visualizer & Sidebar

### Steps

17. **AlbumsView** — `src/views/main/src/components/AlbumsView.tsx`
    - Grid/list of album-type downloads with cover art
    - Click → expand track list (playable + context menus)

18. **Update Sidebar** — new order: Playlists, Albums, Artists, Genres, Visualizer | Settings
    - Extend `NavSection`: add `'albums' | 'visualizer'`
    - Icons: `Disc3` (Albums), `AudioWaveform` (Visualizer)

19. **Butterchurn Visualizer** — `src/views/main/src/components/VisualizerView.tsx`
    - Install `butterchurn` + `butterchurn-presets`
    - Full-size canvas, feeds from `engine.getAnalyserNode()`
    - Auto-cycle presets (30s), preset selector overlay
    - `requestAnimationFrame` loop, active only when view visible
    - Fallback when no audio playing

---

## Phase 5: Interactive Views

### Steps

20. **Interactive ArtistsView**
    - Click artist → expand all their completed tracks (across all downloads)
    - Track rows playable with full context menus
    - Back button to return to list

21. **Search bar** — add to Header or sidebar
    - Filter across playlists, tracks, artists as you type
    - Results grouped by type, clickable to navigate

---

## Phase 6: Download Resilience & Polish

### Steps

22. **Download retry with backoff**
    - On track failure, auto-retry 1-2 times before marking as error
    - Exponential backoff (2s, 8s)
    - In `queue.ts` `runTrack()` — wrap download call in retry loop

23. **Use 'converting' status**
    - After yt-dlp finishes, before ffmpeg metadata embed, set track status to `'converting'`
    - In `queue.ts` around the `embedMetadata` call

24. **Bulk retry failed tracks**
    - "Retry all failed" button in StatusBar or filter view
    - New queue method `retryAllFailed()` — finds all error tracks across downloads, resets and re-queues

25. **Graceful disconnect UI**
    - Toast/banner when RPC connection drops (Electrobun handles this natively — listen for connection events)
    - Auto-reconnect feedback

---

## Phase 7: Keyboard Shortcuts & Media Keys

### Steps

26. **Keyboard shortcuts**
    - Space: play/pause
    - Arrow Left/Right: seek ±5s (Shift: ±10s)
    - M: mute/unmute
    - N: next track, P: previous track
    - Cmd+F: focus search
    - Register globally via Electrobun's event system or DOM keydown

27. **Now Playing indicator**
    - Pulsing icon on the currently-playing track in DownloadList/ArtistsView
    - Highlight the active playlist in sidebar

---

## Phase 8: Lyrics & Additional UX

### Steps

28. **Lyrics fetching** — `src/bun/services/lyrics.ts`
    - Fetch from lrclib.net API (free, no auth): `GET /api/get?artist_name=X&track_name=Y`
    - Return synced LRC or plain text
    - Display in a lyrics panel that can overlay/slide-in from PlayerPanel
    - Synced lyrics highlight current line based on `currentTime`

29. **Import local files** via drag-and-drop
    - Drop audio files onto app → add to Library, create a "Local" playlist
    - Read metadata with ffprobe or embedded tags

30. **Playlist editing**
    - Reorder tracks (drag handle), remove individual tracks, rename playlists
    - Updates persisted to .m3u immediately

31. **Smooth transitions**
    - Animate player panel slide-up on first play
    - CSS transitions for view changes in main content area
    - Use Tailwind's transition utilities

32. **Dark/light theme toggle**
    - Add to SettingsView
    - Persist to localStorage
    - Swap Tailwind color classes (zinc ↔ slate/gray with light bg)

---

## Relevant Files

### Migrated structure
| Old Path | New Path | Action |
|----------|----------|--------|
| `server/src/index.ts` | `src/bun/index.ts` | Rewrite: Express→Electrobun BrowserWindow+RPC |
| `server/src/services/*` | `src/bun/services/*` | Move, minor Bun compat fixes |
| `server/src/types.ts` | `src/shared/types.ts` | Merge with client types |
| `client/src/types.ts` | (deleted, use shared) | |
| `client/src/*` | `src/views/main/src/*` | Replace socket with RPC |
| `client/index.html` | `src/views/main/index.html` | |

### New files
- `electrobun.config.ts` — build config
- `src/shared/types.ts` — single type source
- `src/views/main/src/stores/player.ts` — player state
- `src/views/main/src/audio/engine.ts` — audio engine + analyser
- `src/views/main/src/components/PlayerPanel.tsx` — player UI
- `src/views/main/src/components/AlbumsView.tsx` — albums grid
- `src/views/main/src/components/VisualizerView.tsx` — butterchurn
- `src/views/main/src/components/SearchBar.tsx` — search
- `src/views/main/src/components/LyricsPanel.tsx` — lyrics overlay
- `src/bun/services/lyrics.ts` — lyrics fetcher

### Modified files
- `src/bun/services/queue.ts` — dedup, retry, converting status, file layout
- `src/bun/services/downloader.ts` — output path, findExistingTrack, retry
- `src/bun/services/playlist.ts` — new save path, relative paths
- `src/views/main/src/components/Sidebar.tsx` — Albums + Visualizer items
- `src/views/main/src/components/TrackRow.tsx` — click-to-play, enhanced menus
- `src/views/main/src/components/DownloadRow.tsx` — play button, enhanced menus
- `src/views/main/src/components/ArtistsView.tsx` — interactive + playable
- `src/views/main/src/components/Header.tsx` — search bar integration
- `src/views/main/src/stores/nav.ts` — extended NavSection, navToAlbum/Artist
- `src/views/main/src/App.tsx` — PlayerPanel, routing, transitions

---

## Verification

1. `bunx electrobun init` → app launches with native macOS window showing React UI
2. Paste Spotify URL → tracks download to `~/Music/Reel/Library/{Artist}/`
3. Add same playlist twice → second skips already-downloaded (dedup works)
4. Click completed track → player panel appears, audio plays, seeker moves
5. Right-click → "Play Next" / "Enqueue" → correct queue order
6. Shuffle/Repeat toggles work correctly
7. Navigate to Visualizer → Milkdrop visualization synced to audio
8. "Go to Artist" / "Go to Album" context actions navigate correctly
9. Search filters across tracks/playlists/artists
10. Download fails → auto-retries once, then shows error
11. Keyboard: Space pauses, arrows seek, M mutes, N/P skip
12. Reload app → playlists load from .m3u, tracks playable
13. Lyrics panel shows synced lyrics for currently playing track
14. `bun run build` → produces ~14MB .app bundle

## Decisions

- **Electrobun over Electron**: ~14MB vs ~180MB bundle, native webview, Bun runtime, built-in updates
- **Keep minimal Bun.serve for streaming**: HTMLAudioElement needs a URL; local HTTP server on random port avoids base64 overhead
- **File layout**: `Library/{Artist}/{track}.ext` — flat per artist
- **M3U paths**: relative (`../Library/Artist/track.m4a`)
- **Player queue**: ephemeral (not persisted across reloads)
- **Tailwind**: switch to CLI or PostCSS since no Vite plugin; or use Electrobun's bundler with CSS imports
- **Types**: single `src/shared/types.ts` imported by both bun and view code
- **Socket.IO → Electrobun RPC**: eliminates CORS, port config, reconnection complexity
