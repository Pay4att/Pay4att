#!/bin/sh
set -eu

REPO_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

cd "$REPO_DIR"
node scripts/update-codex-usage.mjs
git add assets/codex-usage.svg

if git diff --cached --quiet; then
  echo "Codex usage is already up to date"
  exit 0
fi

git commit -m "chore: update Codex usage"
git push
