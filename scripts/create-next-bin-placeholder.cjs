const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

const placeholders = [
  path.join(repoRoot, 'packages', 'next', 'dist', 'bin', 'next'),
  path.join(repoRoot, 'packages', 'create-next-app', 'dist', 'index.js'),
  path.join(
    repoRoot,
    'turbopack',
    'packages',
    'devlow-bench',
    'dist',
    'cli.js'
  ),
]

for (const binPath of placeholders) {
  if (fs.existsSync(binPath)) {
    continue
  }

  fs.mkdirSync(path.dirname(binPath), { recursive: true })

  fs.writeFileSync(
    binPath,
    `#!/usr/bin/env node
console.error(
  'Local workspace has not been built yet. Run \'pnpm build\' first.'
)
process.exit(1)
`,
    'utf8'
  )

  if (process.platform !== 'win32') {
    fs.chmodSync(binPath, 0o755)
  }
}
