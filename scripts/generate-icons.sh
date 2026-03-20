#!/bin/sh

set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
SOURCE_SVG="$ROOT_DIR/assets/app-icon.svg"
OUTPUT_PNG="$ROOT_DIR/assets/app-icon.png"
ICONSET_DIR="$ROOT_DIR/assets/icon.iconset"
TMP_DIR="$ROOT_DIR/assets/.icon-build"
MASTER_PNG="$TMP_DIR/app-icon-master.png"

mkdir -p "$ICONSET_DIR" "$TMP_DIR"
rm -f "$ICONSET_DIR"/*.png "$OUTPUT_PNG" "$MASTER_PNG"

if ! sips -s format png "$SOURCE_SVG" --out "$MASTER_PNG" >/dev/null 2>&1; then
  rm -f "$TMP_DIR"/*.png
  qlmanage -t -s 1024 -o "$TMP_DIR" "$SOURCE_SVG" >/dev/null 2>&1
  GENERATED_PNG="$(find "$TMP_DIR" -maxdepth 1 -name '*.png' -print -quit)"
  if [ -z "$GENERATED_PNG" ]; then
    echo "Failed to render $SOURCE_SVG to PNG" >&2
    exit 1
  fi
  mv "$GENERATED_PNG" "$MASTER_PNG"
fi

cp "$MASTER_PNG" "$OUTPUT_PNG"

for size in 16 32 128 256 512; do
  retina_size=$((size * 2))
  sips -z "$size" "$size" "$MASTER_PNG" --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null
  sips -z "$retina_size" "$retina_size" "$MASTER_PNG" --out "$ICONSET_DIR/icon_${size}x${size}@2x.png" >/dev/null
done

echo "Generated $OUTPUT_PNG and $ICONSET_DIR"