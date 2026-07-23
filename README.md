# e-block-nano

回路ブロックを画面上のグリッドに並べ、配置からネットリストを構成するブラウザ PoC。
ブロックを選んで置く・ドラッグで動かす・回す・消す、という編集操作と、隣接から
導通ネットを自動構成する部分を実装している。

シミュレーション実行は差し替え可能な境界 (`SimulationPort`) の裏にスタブとして用意してあり、
本物のエンジン (Falstad CircuitJS1 / ngspice-wasm 等) は後から挿し込める設計。

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
    simulation/    SimulationPort インタフェース + スタブ
  input/editor/    画面エディタ (React hook) → Placement を出力する入力アダプタ
  render/          SVG ブロック描画
  ui/              React コンポーネント (パレット・ボード・操作)
```

- `core/` は React 非依存の純関数。Board 操作は immutable (新しい Board を返す)。
- 入力アダプタ (`input/`) は共通の `Placement` 型を出力する。別の入力手段を足すときも
  この境界を守れば `core/` に影響しない。
- シミュレータは `core/simulation/port.ts` の `SimulationPort` を実装して差し込む。

## 回路シミュレーション (CircuitJS1)

ネットリストを **CircuitJS1 (Falstad)** の回路テキストへ変換し、iframe で
電流をリアルタイム表示する。変換器は `core/simulation/circuitjs/`(純関数)にあり、
lint に error がある間は実行しない(`SimulatorPanel`)。

エンジンの配置は 2 通りで、接続方式が変わる:

- **自前ホスト(既定)= ライブ接続**: 同一オリジンなので CircuitJS1 の
  **JavaScript インターフェース**が使える(`ui/useCircuitJsLive.ts`)。iframe は
  一度だけロードし、netlist の変化(スイッチ開閉・ブロック編集・サンプル切替)は
  `importCircuit` で無再ロード反映。`onupdate` テレメトリで素子電流
  (blockId 対応表は `serializeCircuitJs` が出力)を吸い上げ、盤面の LED ブロックが
  実電流でリアルタイム発光する。API 仕様は自前ホスト内 `doc/js-interface.html` 参照。
- **外部エンジンを指す = 再ロード方式**: `VITE_CIRCUITJS_BASE` で URL を差し替える。
  クロスオリジンでは JS API に触れないため、従来どおり `?cct=` クエリの
  URL 再ロードで反映する(テレメトリなし)。例:

  ```bash
  VITE_CIRCUITJS_BASE="https://www.falstad.com/circuit/circuitjs.html" npm run dev
  ```

自前ホストのエンジン取得(falstad.com のオフライン版から `war/` を抽出して配置):

```bash
npm run fetch:circuitjs   # → public/circuitjs/ (GPLv2 のためコミットしない)
```

### ライセンス上の注意(重要)

CircuitJS1 は **GPLv2**。iframe 埋め込みは集約(mere aggregation)なので本アプリ
(MIT)本体には伝播しないが、**エンジンを同梱して配布する場合は GPLv2 全文の同梱と
ソース入手先(upstream: pfalstad/circuitjs1 系)の明示が必要**。`?cct=` で外部の
公開インスタンスを指す運用ならエンジンを配布しないため同梱義務は生じない。

## ステータス

PoC。単体テストは緑、lint・ビルドとも通る。次の候補はシミュレータ実装 (スタブの置換) と
部品・UX の拡充。

## ライセンス

本アプリのソースは MIT (`LICENSE`)。埋め込む CircuitJS1 は GPLv2 で別ライセンス
(上記「ライセンス上の注意」参照)。
