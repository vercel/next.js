import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(scriptDir, '..')

const selfLinkPath = path.join(
  repoRoot,
  'packages',
  'next',
  'node_modules',
  'next'
)
const selfLinkTarget = path.join(repoRoot, 'packages', 'next')
// Remove any existing symlink or directory before (re-)creating
fs.rmSync(selfLinkPath, { force: true })
fs.symlinkSync(selfLinkTarget, selfLinkPath, 'junction')
console.log(`Created self-link: ${selfLinkPath} -> ${selfLinkTarget}`)
