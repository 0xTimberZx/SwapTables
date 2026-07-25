#!/usr/bin/env bash
# Bootstrap the SwapTables repo from this staged bundle.
# Run from inside the SwapTables/ directory, after creating the empty repo on GitHub.
set -euo pipefail

REMOTE="https://github.com/0xTimberZx/SwapTables.git"

git init -b main
git add .
git commit -m "Initial commit: SwapTables app-layer bundle

Segment-betting tables for TimbSwap (app layer: spec + prototype + scaffold).
On-chain SegmentBoard stays in the TimbSwap repo; onchain/ consumes address + ABI."
git remote add origin "$REMOTE"
git push -u origin main

echo "Pushed to $REMOTE"
