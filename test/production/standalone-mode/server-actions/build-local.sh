#!/bin/bash
set -e

DIR="test/production/standalone-mode/server-actions"

pnpm next build "$DIR"
cp -r "$DIR/public" "$DIR/.next/standalone/$DIR/"
cp -r "$DIR/.next/static" "$DIR/.next/standalone/$DIR/.next/"

echo ""
echo "Build complete. To start the server:"
echo "  node $DIR/.next/standalone/$DIR/server.js"
