#!/usr/bin/env bash
# CircuitJS1 (GPLv2) のコンパイル済み Web ビルドを public/circuitjs/ に配置する。
# 入手元は falstad.com のオフライン版アーカイブ (Electron) 内の war/ ディレクトリ。
# public/circuitjs/ は GPLv2 のためコミットしない (.gitignore 済み)。
set -euo pipefail

URL="https://www.falstad.com/circuit/offline/circuitjs1-linux64.tgz"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/public/circuitjs"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "downloading $URL ..."
curl -fsSL -A "Mozilla/5.0" -o "$WORK/circuitjs1.tgz" "$URL"

echo "extracting war/ ..."
tar -xzf "$WORK/circuitjs1.tgz" -C "$WORK" circuitjs1/resources/app/war 2>/dev/null || true
[ -f "$WORK/circuitjs1/resources/app/war/circuitjs.html" ] || {
  echo "error: circuitjs.html not found in archive" >&2
  exit 1
}

echo "installing to $DEST ..."
rm -rf "$DEST"
mkdir -p "$DEST"
cp -r "$WORK/circuitjs1/resources/app/war/." "$DEST/"
find "$DEST" -name '._*' -type f -delete

echo "done: $(du -sh "$DEST" | cut -f1) installed"
