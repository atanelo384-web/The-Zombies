#!/bin/sh
# Dedicated The Zombies server for Mac / Linux / Raspberry Pi / VPS
cd "$(dirname "$0")"
[ -d node_modules/ws ] || npm install --omit=dev
node electron/server.js "$@"
