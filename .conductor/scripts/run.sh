#!/usr/bin/env bash
set -e

echo "🚀 Starting Next.js dev server (open-source Conductor)"
echo ""

# Move to repo root (important in Conductor)
cd "$(dirname "$0")"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install -g pnpm
  pnpm install
fi

echo "👀 Starting Next.js watch mode..."
echo "⚠️  Do NOT run pnpm build while this is running"
echo ""

pnpm --filter=next dev -- -H 0.0.0.0
