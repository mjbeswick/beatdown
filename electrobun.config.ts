import type { ElectrobunConfig } from 'electrobun/bun';

const config: ElectrobunConfig = {
  app: {
    name: 'Reel',
    identifier: 'dev.reel.app',
    version: '1.0.0',
    description: 'Spotify music downloader',
  },
  build: {
    mac: {
      icons: 'assets/icon.iconset',
    },
    win: {
      icon: 'assets/app-icon.png',
    },
    linux: {
      icon: 'assets/app-icon.png',
    },
    bun: {
      entrypoint: 'src/bun/index.ts',
    },
    views: {
      main: {
        entrypoint: 'src/views/main/index.tsx',
      },
    },
    copy: {
      'src/views/main/index.html': 'views/main/index.html',
    },
  },
};

export default config;
