#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$ROOT/build"
INSTALL_DIR="/Applications"

# Find the app bundle — prefer stable, fall back to dev
APP_PATH="$(find "$BUILD_DIR" -maxdepth 2 -name "*.app" | grep -v '\-dev\.app' | head -1)"
if [[ -z "$APP_PATH" ]]; then
  APP_PATH="$(find "$BUILD_DIR" -maxdepth 2 -name "*.app" | head -1)"
fi

if [[ -z "$APP_PATH" ]]; then
  echo "error: no .app found in $BUILD_DIR"
  echo "       run 'bun run build' first"
  exit 1
fi

APP_NAME="$(basename "$APP_PATH")"
DEST="$INSTALL_DIR/$APP_NAME"

echo "Installing $APP_NAME → $INSTALL_DIR"

if [[ -d "$DEST" ]]; then
  echo "Removing existing installation..."
  rm -rf "$DEST"
fi

cp -R "$APP_PATH" "$DEST"
echo "Done. $APP_NAME is installed in $INSTALL_DIR."
