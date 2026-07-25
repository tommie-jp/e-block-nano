# e-block-nano

回路ブロックを画面上のグリッドに並べ、配置からネットリストを構成するブラウザ PoC。
ブロックを選んで置く・ドラッグで動かす・回す・消す、という編集操作と、隣接から
導通ネットを自動構成する部分を実装している。

シミュレーションエンジンは **ngspice (WASM) 単独**。差し替え可能な境界
(`SimulationPort`) の裏に実装があり、別エンジンを挿し込むこともできる設計。

## 動かし方

```bash
npm install
npm run dev      # 開発サーバ
npm test         # コアロジックの単体テスト (vitest)
npm run lint     # oxlint
npm run build    # 型チェック + プロダクションビルド
```

単一テストの実行例:

```bash
npx vitest run src/core/grid
```

## 操作

- 左のパレットで部品を選び、グリッドのセルをクリックで配置
- ブロックをドラッグで移動 / クリックで選択
- `R` キー または ダブルクリックで回転、`Delete` で削除
- ステータスバーにブロック数と構成されたネット数を表示

## アーキテクチャ

ネットリストを中心の境界に置き、入力源とシミュレータの双方を差し替え可能にしている。

```text
src/
  core/            フレームワーク非依存の純ロジック (テスト対象)
    parts/         部品定義・カタログ (端子・内部配線・SPICE モデル参照)
    grid/          グリッド座標・Placement・immutable な Board 操作
    netlist/       Placement → ネット構成 (辺中央接点を union-find で併合)
    simulation/    SimulationPort / ScopeStream 契約 + SPICE 変換器 (spice/)
  input/editor/    画面エディタ (React hook) → Placement を出力する入力アダプタ
  render/          SVG ブロック描画
  ui/              React コンポーネント (パレット・ボード・操作)
```

- `core/` は React 非依存の純関数。Board 操作は immutable (新しい Board を返す)。
- 入力アダプタ (`input/`) は共通の `Placement` 型を出力する。別の入力手段を足すときも
  この境界を守れば `core/` に影響しない。
- シミュレータは `core/simulation/port.ts` の `SimulationPort` を実装して差し込む。

## 回路シミュレーション (ngspice)

ネットリストを SPICE netlist へ変換して **ngspice (WASM)** で解く。変換器は
`core/simulation/spice/`(純関数)。lint に error がある間は実行しない。
使い方の違う 3 つの経路がある:

- **動作点 (`.op`)** — 盤面を編集するたびに自動で解き、ブロック上に電流を出す
  (`io/ngspiceSimulator.ts`、Web Worker)。ツールバーの「ngspice で計算」で ON/OFF
- **過渡 (`.tran`)** — 波形パネルが on-demand で実行。測定・カーソル・FFT・
  Web Audio 再生つき (`ui/WaveformPanel.tsx`)
- **ライブ連続オシロ** — libngspice の **shared mode** で `.tran` を回し続け、
  `SendData` の各点をリングバッファへ流して 60fps で掃引描画する
  (`ui/scope/LiveScopePanel.tsx`)。実行中に抵抗値を `alter` したりスイッチを
  開閉すると波形がその場で変わり、素子電流はボード上のブロックにも反映される

エンジンの実体 (`src/io/ngspice/libngspice.{mjs,wasm}`) は大きいのでコミットしていない。
clone 直後に一度だけビルドする:

```bash
bash tools/build-ngspice/build.sh   # 詳細は tools/build-ngspice/README.md
```

## ステータス

PoC。単体テストは緑、lint・ビルドとも通る。次の候補は部品カタログとサンプル回路の拡充。

## ライセンス

MIT (`LICENSE`)。
