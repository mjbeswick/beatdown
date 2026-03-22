# Beatdown

A macOS desktop app for downloading and managing your music library. Paste a Spotify or YouTube Music URL and Beatdown finds the audio, downloads it, and tags it — all stored locally on your machine.

Built with [Electrobun](https://electrobun.dev), React, and Bun.

> **Legal disclaimer:** Beatdown is intended for personal, offline use of music you already have legitimate access to (e.g. an active Spotify subscription). Downloading copyrighted content without authorisation may violate the terms of service of the platforms involved and applicable copyright law in your jurisdiction. You are solely responsible for how you use this software. The authors do not condone piracy or any use that infringes on the rights of artists or rights holders.

## Features

**Downloading**
- Paste any Spotify track, album, or playlist URL to queue a download
- Paste a YouTube Music playlist URL to import it directly
- Concurrent downloads with a live progress queue
- Automatic audio tagging (title, artist, album, cover art) via ffmpeg
- Configurable output format (MP3, M4A, FLAC, Opus) and quality

**Library**
- Browse your local library by artist, album, playlist, genre, or favourites
- Full playback with a waveform seeker and seek-by-click
- Persistent playback queue

**Visualizer**
- Built-in spectrum analyzer with multiple display styles
- Milkdrop visualizer powered by [Butterchurn](https://github.com/jberg/butterchurn) with hundreds of presets
- Support for custom Milkdrop preset files

**Other**
- DLNA/Chromecast casting — stream to any renderer on your network
- Lyrics panel with synced display
- Artist info sidebar
- Light and dark themes
- Keyboard shortcuts for playback control

## Prerequisites

- [Bun](https://bun.sh) 1.0+
- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) — `brew install yt-dlp`
- [`ffmpeg`](https://ffmpeg.org) — `brew install ffmpeg`

## Setup

```bash
bun install
bun run dev
```

## Build

```bash
bun run build
```

Downloaded files are saved to `~/Music/Beatdown/` by default. The location can be changed in Settings.
