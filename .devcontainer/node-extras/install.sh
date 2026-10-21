#!/bin/bash
set -euxo pipefail

# pnpm 11+ needs corepack 0.34.5+, newer than what some Node.js images bundle.
npm install -g corepack@0.36.0
corepack enable pnpm
