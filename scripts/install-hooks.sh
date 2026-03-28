#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not inside a git repository."
  exit 1
fi

if [ ! -f .githooks/pre-push ]; then
  echo "Missing .githooks/pre-push"
  exit 1
fi

mkdir -p .git/hooks
cp .githooks/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push

echo "Installed pre-push hook into .git/hooks"
echo "pre-push now runs: lint + test"
