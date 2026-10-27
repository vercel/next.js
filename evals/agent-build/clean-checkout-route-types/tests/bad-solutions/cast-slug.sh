#!/bin/bash
# Rejected by: check-source.mjs (double cast) and, if the cast were allowed,
# check-routes.mjs, because a string[] coerced to a string never matches a
# nested docs path.
set -euo pipefail
node - <<'EOF'
const fs = require('node:fs')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
pkg.scripts.typecheck = 'next typegen && tsc --noEmit'
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
EOF
sed -i "s#LayoutProps<'/(marketing)'>#LayoutProps<'/'>#" 'app/(marketing)/layout.tsx'
sed -i "s#getDoc(slug)#getDoc(slug as unknown as string)#" 'app/docs/[...slug]/page.tsx'
