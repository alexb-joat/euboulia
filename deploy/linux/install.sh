#!/usr/bin/env sh
# Install (or remove with --remove) the daily catalog refresh as systemd *user* units.
# It runs from its own clone at origin/main, so local edits and unpushed commits never reach the public catalog.
# What it does and how to answer a hold: docs/catalog-sources.md.
# Usage: deploy/linux/install.sh [--remove]
set -eu
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
CACHE="$HOME/.cache/euboulia"
BUILD="$CACHE/catalog-build"
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/euboulia"
SOURCE="https://github.com/alexb-joat/euboulia.git"
NINSHUBUR_PY="${NINSHUBUR_PYTHON:-$HOME/ninshubur/.venv/bin/python}"
NINSHUBUR_HOME="${NINSHUBUR_HOME:-$HOME/.ninshubur}"

if [ "${1:-}" = "--remove" ]; then
  systemctl --user disable --now euboulia-catalog.timer 2>/dev/null || true
  rm -f "$UNIT_DIR/euboulia-catalog.timer" "$UNIT_DIR/euboulia-catalog.service" "$UNIT_DIR/euboulia-catalog-failed.service"
  systemctl --user daemon-reload
  echo "removed the units; the clone ($BUILD) and the log ($STATE) are still there"
  exit 0
fi

mkdir -p "$UNIT_DIR" "$CACHE" "$STATE"
[ -d "$BUILD/.git" ] || git clone --quiet "$SOURCE" "$BUILD"
git -C "$BUILD" fetch --quiet origin main
git -C "$BUILD" cat-file -e FETCH_HEAD:scripts/refresh-catalog.mjs 2>/dev/null \
  || { echo "origin/main has no scripts/refresh-catalog.mjs yet; push first, then run this again" >&2; exit 1; }

# The crawl of the providers' docs is optional: without Ninshubur the refresh skips that comparison.
DOCS_STEP=""
DOCS_PATH=""
if [ -x "$NINSHUBUR_PY" ]; then
  DOCS_STEP="ExecStartPre=-$NINSHUBUR_PY -m ninshubur export euboulia-facts -o $STATE/docs-export.json"
  DOCS_PATH="$NINSHUBUR_HOME"
fi

cat > "$UNIT_DIR/euboulia-catalog.service" <<UNIT
[Unit]
Description=Euboulia catalog refresh
OnFailure=euboulia-catalog-failed.service
StartLimitIntervalSec=4h
StartLimitBurst=3

[Service]
Type=oneshot
WorkingDirectory=$BUILD
Environment=NINSHUBUR_HOME=$NINSHUBUR_HOME
# In the sandbox root's files look foreign, and ssh refuses a system config it cannot trust. The key still comes from ~/.ssh.
Environment="GIT_SSH_COMMAND=ssh -F none -o BatchMode=yes"
ExecStartPre=/usr/bin/git fetch --quiet origin main
ExecStartPre=/usr/bin/git checkout --quiet --detach FETCH_HEAD
ExecStartPre=/bin/sh -c 'sha256sum --quiet --check .lock.sha 2>/dev/null || { npm ci --ignore-scripts --no-audit --no-fund --silent --cache $CACHE/npm && sha256sum package-lock.json > .lock.sha; }'
$DOCS_STEP
ExecStart=/usr/bin/node scripts/refresh-catalog.mjs --compare-facts $STATE/docs-export.json
# Mostly a network that is not up yet: three tries, then euboulia-catalog-failed says so.
Restart=on-failure
RestartSec=30min
TimeoutStartSec=15min
# Hardening, as in the Ninshubur unit, minus MemoryDenyWriteExecute: Node's JIT needs it.
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$CACHE $STATE $DOCS_PATH
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=yes
LockPersonality=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
MemoryMax=2G
CapabilityBoundingSet=
UMask=0077
UNIT

cat > "$UNIT_DIR/euboulia-catalog-failed.service" <<UNIT
[Unit]
Description=Say that the Euboulia catalog refresh failed

[Service]
Type=oneshot
ExecStart=-/usr/bin/notify-send --app-name=Euboulia "Euboulia catalog refresh failed" "Nothing was published. See: journalctl --user -u euboulia-catalog"
UNIT

cat > "$UNIT_DIR/euboulia-catalog.timer" <<UNIT
[Unit]
Description=Daily Euboulia catalog refresh

[Timer]
OnCalendar=*-*-* 08:00
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now euboulia-catalog.timer
echo "installed; next run: systemctl --user list-timers euboulia-catalog.timer"
echo "run it now: systemctl --user start euboulia-catalog    log: $STATE/catalog-refresh.jsonl"
