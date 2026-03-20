# Beatdown

A local Spotify playlist downloader with a Transmission-inspired UI.

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
