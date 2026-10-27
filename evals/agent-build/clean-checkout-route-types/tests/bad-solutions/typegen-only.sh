#!/bin/bash
# Rejected by: npm run typecheck. Generating the types exposes the route-group
# layout key and the catch-all slug errors, which this repair leaves in place.
set -euo pipefail
node - <<'EOF'
const fs = require('node:fs')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
pkg.scripts.typecheck = 'next typegen && tsc --noEmit'
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
EOF
