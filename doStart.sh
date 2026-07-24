#!/usr/bin/env bash
#
# e-block-nano の dev サーバーを Tailscale 経由でアクセス可能に起動する。
#
#   ./doStart.sh         HTTPS で公開 (既定)。tailscale serve で TLS 終端する。
#                        Chrome/iOS の HTTPS 強制・HSTS でも開け、カメラ (getUserMedia) も使える。
#   ./doStart.sh --http  HTTPS を張らず素の HTTP で公開 (IP 直打ち等のデバッグ用)。
#
# 既定 (HTTPS) は空きポートを選び、前面 (foreground) の serve が終了時に自マッピングのみ撤去する。
# --http は serve 設定を一切変更しないため、既存の tailscale serve マッピングを壊さない。

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=5173

# --- 引数 ---
USE_HTTPS=1
for arg in "$@"; do
  case "$arg" in
    --http) USE_HTTPS=0 ;;
    --https) USE_HTTPS=1 ;; # 既定だが明示指定も許容
    -h | --help)
      sed -n '3,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "不明な引数: $arg (使い方は --help)" >&2
      exit 2
      ;;
  esac
done

# --- 前提チェック ---
if ! command -v tailscale >/dev/null 2>&1; then
  echo "エラー: tailscale コマンドが見つかりません。" >&2
  exit 1
fi
if ! tailscale status >/dev/null 2>&1; then
  echo "エラー: Tailscale が起動していません。'tailscale up' を実行してください。" >&2
  exit 1
fi
if [[ ! -d "$APP_DIR/node_modules" ]]; then
  echo "エラー: $APP_DIR に依存関係がありません。'cd e-block-nano && npm install' を先に実行してください。" >&2
  exit 1
fi

# MagicDNS 名 (末尾ドット除去) と IPv4 を取得
DNS_NAME="$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')"
TS_IP="$(tailscale ip -4 | head -1)"

# 127.0.0.1:$1 が LISTEN するまで待つ (外部依存なしで /dev/tcp を使用)
wait_for_port() {
  local p="$1" i
  for i in $(seq 1 40); do
    if (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then
      exec 3>&- 3<&-
      return 0
    fi
    sleep 0.25
  done
  return 1
}

# 指定 TCP ポートを LISTEN しているプロセスの PID を列挙 (lsof→ss→fuser の順)
pids_on_port() {
  local p="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:$p" -sTCP:LISTEN 2>/dev/null || true
  elif command -v ss >/dev/null 2>&1; then
    ss -ltnpH "sport = :$p" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true
  elif command -v fuser >/dev/null 2>&1; then
    fuser "$p/tcp" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' || true
  fi
}

# ポート占有時: 占有プロセスを表示し、KILL してよいかユーザに確認する。
# 承諾なし / 非対話時 / 解放失敗時は中止する。
ensure_port_free() {
  local p="$1" pids ans i
  pids="$(pids_on_port "$p")"
  [[ -z "$pids" ]] && return 0

  echo "警告: ポート ${p} は既に使用されています。占有プロセス:" >&2
  # shellcheck disable=SC2046
  ps -o pid,ppid,user,args -p $(echo "$pids" | paste -sd, -) 2>/dev/null | sed 's/^/  /' >&2 || true

  ans=""
  read -r -p "これらのプロセスを KILL してポート ${p} を解放しますか? (yes/no?) [既定: no] " ans </dev/tty 2>/dev/null || ans=""
  case "$ans" in
    y | Y | yes | YES | Yes) ;;
    *)
      echo "中止しました。ポート ${p} を解放してから再実行してください。" >&2
      exit 1
      ;;
  esac

  # まず TERM、~5s 待って残れば KILL
  echo "$pids" | xargs -r kill -TERM 2>/dev/null || true
  for i in $(seq 1 20); do
    pids="$(pids_on_port "$p")"
    [[ -z "$pids" ]] && break
    sleep 0.25
  done
  if [[ -n "$pids" ]]; then
    echo "TERM で終了しないため KILL します: $(echo "$pids" | paste -sd' ' -)" >&2
    echo "$pids" | xargs -r kill -KILL 2>/dev/null || true
    sleep 0.5
  fi

  if [[ -n "$(pids_on_port "$p")" ]]; then
    echo "エラー: ポート ${p} を解放できませんでした。" >&2
    exit 1
  fi
  echo "ポート ${p} を解放しました。" >&2
}

# vite 起動前に dev ポートの占有を確認 (占有時は確認のうえ KILL)
ensure_port_free "$PORT"

if [[ "$USE_HTTPS" -eq 0 ]]; then
  # ---- --http: HTTP で Tailscale インターフェースにバインド ----
  echo "=================================================================="
  echo " e-block-nano dev server (Tailscale / HTTP)"
  echo "   端末内     : http://localhost:${PORT}/"
  echo "   Tailscale : http://${DNS_NAME}:${PORT}/"
  echo "   Tailscale : http://${TS_IP}:${PORT}/"
  echo ""
  echo " iPhone 等の tailnet 端末から上記 URL を開いてください。"
  echo " 注意: Chrome/iOS は HSTS でホスト名を HTTPS 強制する場合があります。"
  echo "       その時は IP 版 URL を使うか、既定の HTTPS モード (引数なし) を使ってください。"
  echo "=================================================================="
  cd "$APP_DIR"
  # 明示的にホストバインド + ポート固定 (占有時は strictPort で明確に失敗させる)
  exec npm run dev -- --host --port "$PORT" --strictPort
fi

# ---- --https: tailscale serve で HTTPS を張る ----
# 既存 serve が使用中の TCP ポートを避けて空きポートを選ぶ
USED_PORTS="$(tailscale serve status --json 2>/dev/null | jq -r '(.TCP // {}) | keys[]' 2>/dev/null || true)"
HTTPS_PORT=""
for cand in 8443 9443 10443 11443; do
  if ! grep -qx "$cand" <<<"$USED_PORTS"; then
    HTTPS_PORT="$cand"
    break
  fi
done
if [[ -z "$HTTPS_PORT" ]]; then
  echo "エラー: HTTPS 用の空きポートが見つかりません (8443/9443/10443/11443 が使用中)。" >&2
  exit 1
fi

# vite を独立セッションで起動し、終了時にプロセスグループごと停止する
setsid bash -c "cd '$APP_DIR' && exec npm run dev -- --host --port $PORT --strictPort" &
VITE_PGID=$!

cleanup() {
  # プロセスグループ全体 (npm + node vite) を止める
  kill -TERM -- "-$VITE_PGID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "vite の起動を待機中..."
if ! wait_for_port "$PORT"; then
  echo "エラー: vite が ${PORT} で起動しませんでした。" >&2
  exit 1
fi

echo "=================================================================="
echo " e-block-nano dev server (Tailscale / HTTPS)"
echo "   HTTPS : https://${DNS_NAME}:${HTTPS_PORT}/"
echo ""
echo " iPhone 等の tailnet 端末から上記 URL を開いてください。"
echo " secure context なのでカメラ (getUserMedia) も利用可能です。"
echo " Ctrl+C で serve と vite を停止します。"
echo "=================================================================="

# 前面 serve は Ctrl+C で自身のマッピングのみ撤去する (既存 serve 設定は保持)
tailscale serve --https="$HTTPS_PORT" "http://127.0.0.1:${PORT}"
