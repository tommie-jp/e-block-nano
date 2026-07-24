# build-ngspice

ライブ連続オシロ（`ui/scope/LiveScopePanel`）用の **libngspice（shared mode）WASM** を生成する
ビルド工具。CircuitJS1 と同じ方針で、生成物（`src/io/ngspice/libngspice.{mjs,wasm}`）は
**コミットしない**（`.gitignore` 済み）。clone 直後や CI では下記を一度実行する。

## 前提

- emsdk（ネイティブ `emcc`）。`EMSDK` 環境変数、無ければ `~/emsdk/emsdk` を使う。
- `autoconf` / `automake` / `libtool`（`libtoolize`）/ `bison` / `perl` / `make`。
- Docker は不要。

## 使い方

```bash
bash tools/build-ngspice/build.sh
```

出力: `src/io/ngspice/libngspice.mjs`（約 78 KB のグルー）と `libngspice.wasm`（約 4.9 MB）。

作業ツリーは `tools/build-ngspice/.work/`（gitignore 済み）に作られる。再実行時は clone を再利用。

## 何をしているか（要点）

1. ngspice を clone（`danchitnis/ngspice-sf-mirror`）。
2. emscripten 向けパッチ（clang フラグ、`getrusage` 除外）と、`--disable-xspice` 時の
   `OPT_ENH_RSHUNT` 未定義バグの回避を当てる。
3. `emconfigure ../configure --with-ngshared …` で **shared library** をコンフィグし、
   `emmake make` で全オブジェクトをコンパイル（libtool の最終 `.so` リンクは side module に
   なるので使わない＝失敗してよい）。
4. できたオブジェクト＋各デバイス／解析の静的アーカイブを `emcc` で **main module** に手動
   リンク。`ngSpice_Init` / `ngSpice_Command` / `ngSpice_Circ` などの shared API をエクスポート。

**ASYNCIFY は使わない。** 連続 `.tran` は breakpoint（`stop when time > X`）+ `resume` で
制御点を得るため、wasm 内で sleep する必要がない（→ 小型・高速）。設計の背景は private
umbrella リポジトリの `docs/07` を参照。
