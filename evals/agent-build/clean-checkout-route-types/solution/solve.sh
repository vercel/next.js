#!/bin/bash
# Reference repair for nextjs/clean-checkout-route-types.
#
# 1. Generate the route types before tsc runs, so a clean clone has them.
# 2. Route groups are not part of the generated layout routes; the grouped
#    layout shares the "/" key with the root layout.
# 3. A catch-all segment is a string[]; look the doc up by its joined path.
set -euo pipefail

node - <<'EOF'
const fs = require('node:fs')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
pkg.scripts.typecheck = 'next typegen && tsc --noEmit'
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
EOF

sed -i "s#LayoutProps<'/(marketing)'>#LayoutProps<'/'>#" 'app/(marketing)/layout.tsx'
sed -i "s#getDoc(slug)#getDoc(slug.join('/'))#" 'app/docs/[...slug]/page.tsx'

npm run typecheck
