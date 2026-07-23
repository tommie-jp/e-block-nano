#!/usr/bin/env python3
"""紙プロトタイプの「真上撮影写真」を合成生成する (第1弾: Lチカ回路)。

拡散モデルは使わない: タグはビット単位で正確でなければ意味がないので、OpenCV の
aruco で各タグを描画し、盤面レイアウトどおりに合成する。同じレンダラから 600dpi
印刷用画像も出せる。劣化シミュレーション (チルト/照明ムラ/ぼけ/ノイズ) はここでは
行わず、劣化なしの理想画像 (v0) と正解 JSON サイドカーだけを出力する。

入力:
  - circuits/<name>.board.json   e-block-nano の versioned 盤面ファイル (正解データ)
  - tag_assignment.json          部品ID ↔ タグID の正準割当

出力 (out/):
  - <name>_ideal.png             劣化なしの真上視点画像
  - <name>_ideal.groundtruth.json  四隅マーカー座標・セルごとのタグID/向き/位置

向きの規約: orientation は時計回り (rotateBlock と同じ)。タグ画像を
orientation ぶん時計回りに回して貼る。認識側は逆変換で向きを復元する。
"""

from __future__ import annotations

import argparse
import json
import string
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent

# --- 盤面・撮影パラメータ (docs/recognition-pipeline.md の決定事項) ---
CELL_PITCH_MM = 10.16        # 4P ピッチ (2.54mm × 4)
TAG_PRINT_MM = 8.0           # セル内のタグ印刷領域
QUIET_ZONE_MODULES = 1.0     # 白のクワイエットゾーン (36h11 実質10モジュール想定)
TAG_MODULES = 10.0
CORNER_MARKER_MM = 12.0      # 四隅フィデューシャル (検出安定のため大きめ)
DEFAULT_PX_PER_MM = 20       # 保守値 (12MP・撮影15-20cm 相当は約30px/mm)

# 見た目 (紙片ブロックの表現)
PAPER_GRAY = 237             # 紙片本体の明度
PAPER_BORDER_GRAY = 170      # 紙片の縁
GRID_LINE_GRAY = 205         # 盤面グリッド線
LABEL_GRAY = 120             # セル座標ラベル
PAPER_INSET_RATIO = 0.06     # セルに対する紙片の内側マージン

CELL_DICT = cv2.aruco.DICT_APRILTAG_36h11
CORNER_DICT = cv2.aruco.DICT_4X4_250
CORNER_ORDER = ["TL", "TR", "BR", "BL"]


@dataclass(frozen=True)
class Placement:
    part_id: str
    row: int
    col: int
    orientation: int
    tag_id: int


def rotate_cw(img: np.ndarray, degrees: int) -> np.ndarray:
    """画像を時計回りに degrees (90の倍数) 回転する。"""
    k_ccw = (4 - (degrees // 90)) % 4  # np.rot90 は反時計回り
    return np.rot90(img, k_ccw)


def load_assignment(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data


def load_board(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("version") != 1:
        raise SystemExit(f"未対応の盤面バージョン: {data.get('version')}")
    return data


def make_cell_tag(dictionary, tag_id: int, tag_px: int, quiet_px: int) -> np.ndarray:
    """白背景 + クワイエットゾーン付きのタグタイル (グレースケール) を返す。"""
    marker = cv2.aruco.generateImageMarker(dictionary, tag_id, tag_px)
    tile = np.full((tag_px + 2 * quiet_px, tag_px + 2 * quiet_px), 255, np.uint8)
    tile[quiet_px:quiet_px + tag_px, quiet_px:quiet_px + tag_px] = marker
    return tile


def paste_gray(dst: np.ndarray, tile: np.ndarray, cx: int, cy: int) -> tuple[int, int, int, int]:
    """tile (グレースケール) を dst (BGR) の中心 (cx,cy) に貼り、貼付box(x,y,w,h)を返す。"""
    h, w = tile.shape[:2]
    x0 = cx - w // 2
    y0 = cy - h // 2
    tile_bgr = cv2.cvtColor(tile, cv2.COLOR_GRAY2BGR)
    dst[y0:y0 + h, x0:x0 + w] = tile_bgr
    return x0, y0, w, h


def render(board: dict, assignment: dict, px_per_mm: float) -> tuple[np.ndarray, dict]:
    rows = board["rows"]
    cols = board["cols"]
    parts_map = assignment["parts"]

    cell_px = round(CELL_PITCH_MM * px_per_mm)
    margin_px = cell_px  # 1セルぶんの余白 (四隅マーカー + ラベル用)
    tag_px = round(TAG_PRINT_MM * px_per_mm)
    quiet_px = round(TAG_PRINT_MM / TAG_MODULES * QUIET_ZONE_MODULES * px_per_mm)
    corner_px = round(CORNER_MARKER_MM * px_per_mm)

    grid_w = cols * cell_px
    grid_h = rows * cell_px
    img_w = grid_w + 2 * margin_px
    img_h = grid_h + 2 * margin_px
    gx0, gy0 = margin_px, margin_px

    img = np.full((img_h, img_w, 3), 255, np.uint8)

    # --- グリッド線 ---
    for c in range(cols + 1):
        x = gx0 + c * cell_px
        cv2.line(img, (x, gy0), (x, gy0 + grid_h), (GRID_LINE_GRAY,) * 3, 1)
    for r in range(rows + 1):
        y = gy0 + r * cell_px
        cv2.line(img, (gx0, y), (gx0 + grid_w, y), (GRID_LINE_GRAY,) * 3, 1)

    # --- セル座標ラベル (列 A.. / 行 1.. )。上面はタグ専用なので余白側に置く ---
    letters = string.ascii_uppercase
    for c in range(cols):
        label = letters[c] if c < len(letters) else str(c)
        cv2.putText(img, label, (gx0 + c * cell_px + cell_px // 2 - 8, gy0 - 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (LABEL_GRAY,) * 3, 2, cv2.LINE_AA)
    for r in range(rows):
        cv2.putText(img, str(r + 1), (gx0 - margin_px // 2, gy0 + r * cell_px + cell_px // 2 + 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (LABEL_GRAY,) * 3, 2, cv2.LINE_AA)

    # --- 四隅フィデューシャル (外側4隅、外角を画像端に合わせる) ---
    corner_dict = cv2.aruco.getPredefinedDictionary(CORNER_DICT)
    corner_ids = assignment["cornerMarkerIds"]
    inset = round(0.5 * px_per_mm)  # 端から少しだけ内側
    corner_positions = {
        "TL": (inset, inset),
        "TR": (img_w - corner_px - inset, inset),
        "BR": (img_w - corner_px - inset, img_h - corner_px - inset),
        "BL": (inset, img_h - corner_px - inset),
    }
    board_mm = {
        "TL": [0.0, 0.0],
        "TR": [img_w / px_per_mm, 0.0],
        "BR": [img_w / px_per_mm, img_h / px_per_mm],
        "BL": [0.0, img_h / px_per_mm],
    }
    corner_meta = []
    for role in CORNER_ORDER:
        mid = corner_ids[role]
        x0, y0 = corner_positions[role]
        marker = cv2.aruco.generateImageMarker(corner_dict, mid, corner_px)
        img[y0:y0 + corner_px, x0:x0 + corner_px] = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)
        corner_meta.append({
            "id": mid,
            "role": role,
            "centerPx": [x0 + corner_px / 2, y0 + corner_px / 2],
            "boardMm": board_mm[role],
        })

    # --- 各ブロック (紙片 + タグ) ---
    cell_dict = cv2.aruco.getPredefinedDictionary(CELL_DICT)
    inset_px = round(cell_px * PAPER_INSET_RATIO)
    placements_meta = []
    for p in board["placements"]:
        part_id = p["partId"]
        if part_id not in parts_map:
            raise SystemExit(f"割当表に無い部品: {part_id}")
        tag_id = parts_map[part_id]
        row, col = p["cell"]["row"], p["cell"]["col"]
        orientation = int(p.get("orientation", 0))

        cell_x0 = gx0 + col * cell_px
        cell_y0 = gy0 + row * cell_px
        cx = cell_x0 + cell_px // 2
        cy = cell_y0 + cell_px // 2

        # 紙片 (薄グレー + 縁)
        px0, py0 = cell_x0 + inset_px, cell_y0 + inset_px
        px1, py1 = cell_x0 + cell_px - inset_px, cell_y0 + cell_px - inset_px
        cv2.rectangle(img, (px0, py0), (px1, py1), (PAPER_GRAY,) * 3, -1)
        cv2.rectangle(img, (px0, py0), (px1, py1), (PAPER_BORDER_GRAY,) * 3, 2)

        # タグ (向きぶん時計回りに回転して中央へ)
        tile = make_cell_tag(cell_dict, tag_id, tag_px, quiet_px)
        tile = rotate_cw(tile, orientation)
        bx, by, bw, bh = paste_gray(img, tile, cx, cy)

        placements_meta.append({
            "partId": part_id,
            "cell": {"row": row, "col": col},
            "cellLabel": f"{letters[col] if col < len(letters) else col}{row + 1}",
            "orientation": orientation,
            "tagId": tag_id,
            "centerPx": [cx, cy],
            "tagBoxPx": [bx, by, bw, bh],
        })

    groundtruth = {
        "schema": "e-block-nano/paper-proto-groundtruth@1",
        "image": {"width": img_w, "height": img_h, "pxPerMm": px_per_mm},
        "board": {
            "rows": rows,
            "cols": cols,
            "cellPitchMm": CELL_PITCH_MM,
            "widthMm": img_w / px_per_mm,
            "heightMm": img_h / px_per_mm,
        },
        "grid": {"originPx": [gx0, gy0], "cellPx": cell_px},
        "cornerMarkers": {"dictionary": "DICT_4X4_250", "markers": corner_meta},
        "cellTags": {"dictionary": "DICT_APRILTAG_36h11"},
        "placements": placements_meta,
    }
    return img, groundtruth


def self_check(img: np.ndarray, groundtruth: dict) -> bool:
    """理想画像が実際にデコードできるか aruco で確認する (割当・向きの疎通確認)。"""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    ok = True

    # 四隅マーカー
    cdict = cv2.aruco.getPredefinedDictionary(CORNER_DICT)
    cdet = cv2.aruco.ArucoDetector(cdict, cv2.aruco.DetectorParameters())
    _, cids, _ = cdet.detectMarkers(gray)
    found_corner = set(int(i) for i in cids.flatten()) if cids is not None else set()
    want_corner = {m["id"] for m in groundtruth["cornerMarkers"]["markers"]}
    if found_corner != want_corner:
        print(f"  [NG] 四隅マーカー: 期待 {sorted(want_corner)} / 検出 {sorted(found_corner)}")
        ok = False
    else:
        print(f"  [OK] 四隅マーカー 4個検出 {sorted(found_corner)}")

    # セルタグ
    tdict = cv2.aruco.getPredefinedDictionary(CELL_DICT)
    tdet = cv2.aruco.ArucoDetector(tdict, cv2.aruco.DetectorParameters())
    tcorners, tids, _ = tdet.detectMarkers(gray)
    found = {}
    if tids is not None:
        for pts, tid in zip(tcorners, tids.flatten()):
            cx, cy = pts[0].mean(axis=0)
            found[int(round(cx)), int(round(cy))] = int(tid)
    want = [(tuple(p["centerPx"]), p["tagId"], p["cellLabel"]) for p in groundtruth["placements"]]
    matched = 0
    for (wx, wy), tid, label in want:
        # 中央が最も近い検出タグを対応付け
        best = None
        for (fx, fy), fid in found.items():
            d = (fx - wx) ** 2 + (fy - wy) ** 2
            if best is None or d < best[0]:
                best = (d, fid)
        if best is not None and best[1] == tid and best[0] <= (0.5 * groundtruth["grid"]["cellPx"]) ** 2:
            matched += 1
        else:
            print(f"  [NG] {label}: 期待 tagId={tid} / 近傍検出={best[1] if best else None}")
            ok = False
    print(f"  [{'OK' if matched == len(want) else 'NG'}] セルタグ {matched}/{len(want)} 一致")
    return ok


def main() -> None:
    ap = argparse.ArgumentParser(description="紙プロトタイプの真上撮影写真を合成生成する")
    ap.add_argument("--board", default=str(HERE / "circuits" / "lchika.board.json"),
                    help="盤面ファイル (e-block-nano version 1)")
    ap.add_argument("--assignment", default=str(HERE / "tag_assignment.json"),
                    help="部品ID ↔ タグID 割当表")
    ap.add_argument("--out-dir", default=str(HERE / "out"), help="出力ディレクトリ")
    ap.add_argument("--px-per-mm", type=float, default=DEFAULT_PX_PER_MM,
                    help=f"解像度 px/mm (既定 {DEFAULT_PX_PER_MM})")
    ap.add_argument("--no-self-check", action="store_true", help="デコード疎通確認を省く")
    args = ap.parse_args()

    board_path = Path(args.board)
    board = load_board(board_path)
    assignment = load_assignment(Path(args.assignment))

    img, groundtruth = render(board, assignment, args.px_per_mm)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = board_path.stem.replace(".board", "")
    img_path = out_dir / f"{stem}_ideal.png"
    gt_path = out_dir / f"{stem}_ideal.groundtruth.json"

    groundtruth["image"]["file"] = img_path.name
    groundtruth["boardFile"] = str(board_path.relative_to(HERE)) if board_path.is_relative_to(HERE) else str(board_path)

    cv2.imwrite(str(img_path), img)
    gt_path.write_text(json.dumps(groundtruth, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"画像       : {img_path}  ({img.shape[1]}x{img.shape[0]}px, {args.px_per_mm}px/mm)")
    print(f"正解データ : {gt_path}  (配置 {len(groundtruth['placements'])} 個)")

    if not args.no_self_check:
        print("デコード疎通確認:")
        ok = self_check(img, groundtruth)
        if not ok:
            raise SystemExit("self-check 失敗: 理想画像がデコードできない")
        print("  => 全タグ・四隅マーカーをデコード確認")


if __name__ == "__main__":
    main()
