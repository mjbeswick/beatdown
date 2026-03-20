# Beatdown

A local Spotify downloader with YouTube Music playlist support and a Transmission-inspired UI.

## Prerequisites

- Node.js 18+
- `yt-dlp` installed (`pip install yt-dlp` or `brew install yt-dlp`)
- `ffmpeg` installed (`brew install ffmpeg`)

## Setup

```bash
npm install
cd server && npm install
cd ../client && npm install
```

## Run

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Downloads

Files are saved to `~/Music/Beatdown/<playlist-name>/`

Supported URLs:

- Spotify track, album, and playlist URLs
- YouTube Music playlist URLs
