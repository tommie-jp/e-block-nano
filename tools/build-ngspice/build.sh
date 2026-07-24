#!/bin/bash
#
# libngspice(shared mode)を WebAssembly 化し、src/io/ngspice/ へ出力する。
#
# ライブ連続オシロ(LiveScopePanel)用の自前エンジン。CircuitJS1 と同じく wasm は
# コミットせず(gitignore)、このスクリプトで生成する。
#
# 前提: emsdk(ネイティブ emcc)。Docker 不要。
#   EMSDK 環境変数、無ければ ~/emsdk/emsdk を使う。
# 使い方:
#   bash tools/build-ngspice/build.sh
#
# 設計メモ(なぜこの構成か)は private umbrella リポジトリの docs/07 参照。
set -uo pipefail

HERE=$(dirname "$(realpath "$0")")
APP_ROOT=$(realpath "$HERE/../..")
OUT="$APP_ROOT/src/io/ngspice"
WORK="${NGSPICE_WORK:-$HERE/.work}"
EMSDK_DIR="${EMSDK:-$HOME/emsdk/emsdk}"
NGSPICE_REPO="https://github.com/danchitnis/ngspice-sf-mirror"

# shellcheck disable=SC1091
source "$EMSDK_DIR/emsdk_env.sh" >/dev/null 2>&1 || {
  echo "emsdk が見つかりません: $EMSDK_DIR (EMSDK 環境変数で指定可)"; exit 1;
}

echo "### 1/4 clone ngspice"
mkdir -p "$WORK"; cd "$WORK"
[ -d ngspice ] || git clone --depth 1 "$NGSPICE_REPO" ngspice
cd ngspice

echo "### 2/4 patch for emscripten / --disable-xspice"
# clang フラグ差異と、ブラウザに無い getrusage を外す(eecircuit/wokwi と同じ)
sed -i 's/-Wno-unused-but-set-variable/-Wno-unused-const-variable/g' configure.ac
sed -i 's/AC_CHECK_FUNCS(\[time getrusage\])/AC_CHECK_FUNCS(\[time\])/g' configure.ac
# OPT_ENH_RSHUNT は XSPICE 限定定義なのに cktsopt.c の非 XSPICE #else が参照する
# ngspice のバグ。--disable-xspice でビルドできるよう定義を補う。
grep -q 'OPT_ENH_RSHUNT = 108' src/include/ngspice/optdefs.h || \
  perl -0pi -e 's/(#define OPT_TOTALDEV 200)/#ifndef XSPICE\nenum { OPT_ENH_RSHUNT = 108 };\n#endif\n\n$1/' \
    src/include/ngspice/optdefs.h

echo "### 3/4 configure + compile objects (shared mode)"
./autogen.sh
rm -rf release && mkdir release && cd release
emconfigure ../configure --with-ngshared \
  --disable-debug --disable-openmp --disable-xspice --disable-osdi \
  --without-x --with-readline=no
# libtool の最終 .so リンクはブラウザ向けには使えない(side module になる)ので
# 失敗してよい。全オブジェクトさえ揃えば次で main module を手動リンクする。
emmake make -j"$(nproc)" || true

echo "### 4/4 link a self-contained main module (no ASYNCIFY)"
# 連続演算は breakpoint+resume で制御点を得るので ASYNCIFY 不要 → 小型・高速。
TOP=$(find src/.libs -maxdepth 1 -name 'libngspice_la-*.o' | tr '\n' ' ')
ARCHIVES=$(find . -name '*.a' | tr '\n' ' ')
mkdir -p "$OUT"
# shellcheck disable=SC2086
emcc $TOP $ARCHIVES -O2 \
  -s ENVIRONMENT="web,worker" -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=67108864 \
  -s MODULARIZE=1 -s EXPORT_ES6=1 -s ALLOW_TABLE_GROWTH=1 -s IGNORE_MISSING_MAIN=1 \
  -s EXPORTED_FUNCTIONS='["_ngSpice_Init","_ngSpice_Command","_ngSpice_Circ","_ngGet_Vec_Info","_ngSpice_running","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","addFunction","removeFunction","UTF8ToString","stringToUTF8","lengthBytesUTF8","getValue","setValue"]' \
  -o "$OUT/libngspice.mjs"

echo "### done -> $OUT/libngspice.{mjs,wasm}"
ls -la "$OUT"/libngspice.*
