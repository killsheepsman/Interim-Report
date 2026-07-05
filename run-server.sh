#!/usr/bin/env bash
set -euo pipefail

export NVM_DIR="/home/ym/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null
fi

cd /home/ym/Interim-Report
export HOST="0.0.0.0"
export PORT="4173"
export QMS_DATA_DIR="/home/ym/qms-data"

exec node server/index.mjs
