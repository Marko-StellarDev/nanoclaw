#!/usr/bin/env bash
# NanoClaw Watchdog — single-shot health check, runs every 5 min via launchd (macOS) or systemd timer (Linux).
# Tracks consecutive failures in a state file; restarts the service after 3 failures.
#
# Setup: see INTEL_SETUP.md "Watchdog Setup" section.

set -euo pipefail

HEALTH_URL="http://127.0.0.1:3001/api/health"
SERVICE_LABEL="com.nanoclaw"
NANOCLAW_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Detect platform
if [[ "$(uname)" == "Darwin" ]]; then
  PLATFORM="macos"
else
  PLATFORM="linux"
fi
LOG_FILE="${NANOCLAW_DIR}/logs/watchdog.log"
STATE_FILE="${NANOCLAW_DIR}/logs/watchdog.state"
MAX_FAILURES=3

mkdir -p "${NANOCLAW_DIR}/logs"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

FAILURES=$(cat "$STATE_FILE" 2>/dev/null || echo "0")

if curl -sf --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
  if [ "$FAILURES" -gt 0 ]; then
    log "Health OK — recovered after ${FAILURES} consecutive failure(s)"
  fi
  echo "0" > "$STATE_FILE"
else
  FAILURES=$((FAILURES + 1))
  echo "$FAILURES" > "$STATE_FILE"
  log "Health check FAILED — consecutive failures: ${FAILURES}/${MAX_FAILURES}"

  if [ "$FAILURES" -ge "$MAX_FAILURES" ]; then
    log "Restarting service: ${SERVICE_LABEL}"
    if [[ "$PLATFORM" == "macos" ]]; then
      launchctl kickstart -k "gui/$(id -u)/${SERVICE_LABEL}" >> "$LOG_FILE" 2>&1 || \
        log "WARNING: launchctl kickstart failed — service may need manual restart"
    else
      systemctl --user restart nanoclaw >> "$LOG_FILE" 2>&1 || \
        log "WARNING: systemctl restart failed — service may need manual restart"
    fi
    echo "0" > "$STATE_FILE"
    log "Restart triggered"
  fi
fi
