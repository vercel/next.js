#!/bin/bash
set -euxo pipefail

# pnpm 11+ needs corepack 0.34.5+, newer than what some Node.js images bundle.
# Pin 0.34.7 because corepack 0.35+ drops Node.js 20 support.
npm install -g corepack@0.34.7
corepack enable pnpm
