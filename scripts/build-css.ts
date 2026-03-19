#!/usr/bin/env bun
/**
 * Pre-build Tailwind CSS using PostCSS.
 * Outputs src/views/main/tailwind.css which is imported by the view.
 *
 * Usage:
 *   bun scripts/build-css.ts           # one-shot build
 *   bun scripts/build-css.ts --watch   # watch mode (rebuilds on source change)
 */

import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { watch } from 'fs';
import { resolve } from 'path';

const INPUT = resolve(import.meta.dir, '../src/views/main/index.css');
const OUTPUT = resolve(import.meta.dir, '../src/views/main/tailwind.css');
const WATCH_DIR = resolve(import.meta.dir, '../src/views/main');

async function build() {
  const src = await Bun.file(INPUT).text();
  const result = await postcss([tailwindcss]).process(src, { from: INPUT });
  await Bun.write(OUTPUT, result.css);
  console.log(`[css] Built ${result.css.length} bytes → tailwind.css`);
}

const isWatch = process.argv.includes('--watch');

await build();

if (isWatch) {
  console.log('[css] Watching for changes...');
  let debounce: ReturnType<typeof setTimeout> | null = null;
  watch(WATCH_DIR, { recursive: true }, (_, filename) => {
    if (!filename?.match(/\.(tsx?|html|css)$/) || filename === 'tailwind.css') return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      build().catch(console.error);
    }, 150);
  });
}
