#!/bin/bash
#
# Conductor Run Script for Next.js
#
# This script runs when starting work in a Conductor workspace.
# It starts the watch mode build for fast iteration.
#

set -e

echo "🚀 Starting Next.js development environment..."
echo ""
echo "Starting watch mode (pnpm --filter=next dev)..."
echo "This will auto-rebuild on file changes."
echo ""
echo "⚠️  Remember: Never run 'pnpm build' while this is running!"
echo ""

# Start the watch mode build for the next package
pnpm --filter=next dev
