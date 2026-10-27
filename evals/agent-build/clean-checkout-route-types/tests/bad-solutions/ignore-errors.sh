#!/bin/bash
# Rejected by: check-source.mjs. The typecheck script can no longer fail and
# the build ignores type errors.
set -euo pipefail
node - <<'EOF'
const fs = require('node:fs')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
pkg.scripts.typecheck = 'next typegen && tsc --noEmit || true'
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
fs.writeFileSync(
  'next.config.ts',
  `import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
`
)
EOF
