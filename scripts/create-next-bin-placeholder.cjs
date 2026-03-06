const fs = require('node:fs')
const path = require('node:path')

const binPath = path.join(
  __dirname,
  '..',
  'packages',
  'next',
  'dist',
  'bin',
  'next'
)

if (!fs.existsSync(binPath)) {
  fs.mkdirSync(path.dirname(binPath), { recursive: true })

  fs.writeFileSync(
    binPath,
    `#!/usr/bin/env node
console.error(
  'Local workspace \'next\' has not been built yet. Run \'pnpm build\' first.'
)
process.exit(1)
`,
    'utf8'
  )

  if (process.platform !== 'win32') {
    fs.chmodSync(binPath, 0o755)
  }
}
