#!/usr/bin/env bash
# Baut das Plugin und kopiert es in den Vault.
# Aufruf: scripts/install.sh "/Pfad/zum/Obsidian Vault"
set -euo pipefail
VAULT="${1:?Pfad zum Vault angeben}"
cd "$(dirname "$0")/.."
npm run build
DEST="$VAULT/.obsidian/plugins/focus-queue"
mkdir -p "$DEST"
cp dist/main.js dist/manifest.json dist/styles.css "$DEST/"
echo "Installiert nach $DEST – in Obsidian: Cmd+P → „Reload app without saving“."
