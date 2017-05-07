import del from 'del'
import cp from 'recursive-copy'
import mkdirp from 'mkdirp-then'
import { resolve, join } from 'path'
import { existsSync, readFileSync } from 'fs'

export default async function (dir) {
  const outDir = resolve(dir, '.out')
  const nextDir = resolve(dir, '.next')

  if (!existsSync(nextDir)) {
    console.error('Build your with "next build" before running "next start".')
    process.exit(1)
  }

  const buildId = readFileSync(join(nextDir, 'BUILD_ID'), 'utf8')
  const buildStats = require(join(nextDir, 'build-stats.json'))

  // Initialize the output directory
  await del(outDir)
  await mkdirp(join(outDir, '_next', buildStats['app.js'].hash))
  await mkdirp(join(outDir, '_next', buildId))

  // Copy files
  await cp(
    join(nextDir, 'app.js'),
    join(outDir, '_next', buildStats['app.js'].hash, 'app.js')
  )

  await cp(
    join(nextDir, 'bundles', 'pages'),
    join(outDir, '_next', buildId, 'page')
  )
}
