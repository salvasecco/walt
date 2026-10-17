#!/usr/bin/env bash
# Runs the worker forever: restarts it if it crashes and appends everything to a log file.
# Usage: scripts/run-worker.sh            (log in logs/worker.log)
#        LOG_FILE=/tmp/w.log scripts/run-worker.sh
# Stop with Ctrl+C (stops the loop too).
set -u
cd "$(dirname "$0")/.."
LOG_FILE="${LOG_FILE:-logs/worker.log}"
mkdir -p "$(dirname "$LOG_FILE")"
DELAY=2
child=""
stop() {
  echo "[run-worker] $(date "+%F %T") detenido" | tee -a "$LOG_FILE"
  [[ -n "$child" ]] && kill -TERM "$child" 2>/dev/null && wait "$child" 2>/dev/null
  exit 0
}
trap stop INT TERM

while true; do
  echo "[run-worker] $(date "+%F %T") arranca el worker" | tee -a "$LOG_FILE"
  started=$(date +%s)
  # In the background + wait, so Ctrl+C or TERM stop the worker right away (and the loop with it).
  pnpm start:worker > >(tee -a "$LOG_FILE") 2>&1 < /dev/stdin &
  child=$!
  wait "$child"
  code=$?
  child=""
  # If it ran for a while, it was a real crash: restart fast. If it dies right away, back off up to 30 s.
  if (( $(date +%s) - started > 60 )); then DELAY=2; else DELAY=$(( DELAY * 2 > 30 ? 30 : DELAY * 2 )); fi
  echo "[run-worker] $(date "+%F %T") el worker terminó con código $code; reinicio en ${DELAY}s" | tee -a "$LOG_FILE"
  sleep "$DELAY"
done
