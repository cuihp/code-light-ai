#!/bin/bash
set -euo pipefail

APP_NAME="Code Light"
BIN_NAME="code-light"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION=$(grep '"version"' "$SRC_DIR/package.json" | head -1 | sed 's/.*: *"//;s/".*//')
OUT_DIR="$SRC_DIR/dist"

echo "=== Building $APP_NAME v$VERSION ==="

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

build_arch() {
    local target=$1
    local arch_label=$2
    local arch_suffix=$3

    echo ""
    echo "--- Building for $arch_label ($target) ---"

    pnpm tauri build --target "$target" 2>&1 | tail -5

    local app_bundle="$SRC_DIR/src-tauri/target/$target/release/bundle/macos/$APP_NAME.app"
    local dmg_path="$OUT_DIR/${APP_NAME/ /_}_${VERSION}_${arch_suffix}.dmg"

    if [ ! -d "$app_bundle" ]; then
        echo "ERROR: $app_bundle not found"
        exit 1
    fi

    echo "Creating DMG: $(basename "$dmg_path")"
    hdiutil create -volname "$APP_NAME" -srcfolder "$app_bundle" -ov -format UDZO "$dmg_path"

    echo "OK: $(basename "$dmg_path") ($(du -h "$dmg_path" | cut -f1))"
}

cd "$SRC_DIR"

build_arch "aarch64-apple-darwin" "Apple Silicon" "aarch64"
build_arch "x86_64-apple-darwin"  "Intel"         "x64"

echo ""
echo "=== Done ==="
ls -lh "$OUT_DIR"
