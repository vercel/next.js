#!/bin/bash
set -euo pipefail
node <<'NODE'
const fs = require('node:fs')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
pkg.scripts.typecheck = 'next typegen && tsc --noEmit'
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
NODE
npm run typecheck
