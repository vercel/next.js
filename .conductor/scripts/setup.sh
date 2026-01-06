#!/bin/bash
#
# Conductor Setup Script for Next.js
#
# This script runs when creating a new Conductor workspace.
# It ensures the development environment is properly configured.
#

set -e

echo "🔧 Setting up Next.js development environment..."

# Enable corepack for pnpm (requires pnpm 9.6.0)
if command -v corepack &> /dev/null; then
  echo "📦 Enabling corepack for pnpm..."
  corepack enable pnpm
fi

# Validate Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js 18+ required (found: $(node -v))"
  exit 1
fi
echo "✓ Node.js $(node -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install --prefer-offline

# Build all packages
echo "🏗️ Building packages..."
pnpm build

echo ""
echo "✅ Setup complete! Ready for development."
echo ""
echo "Tips:"
echo "  • Run 'pnpm test-dev-turbo <path>' for fast test iteration"
echo "  • Run 'pnpm --filter=next dev' for watch mode"
echo "  • Run 'pnpm sweep' periodically to clean Rust build artifacts"
