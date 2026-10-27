#!/bin/bash
# Rejected by: check-source.mjs (the marketing layout must still exist) and
# check-routes.mjs (the marketing nav and footer disappear from / and
# /pricing).
set -euo pipefail
node - <<'EOF'
const fs = require('node:fs')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
pkg.scripts.typecheck = 'next typegen && tsc --noEmit'
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
EOF
rm 'app/(marketing)/layout.tsx'
sed -i "s#getDoc(slug)#getDoc(slug.join('/'))#" 'app/docs/[...slug]/page.tsx'
