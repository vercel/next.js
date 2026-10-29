import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Installation rewrites the manifest and creates the lockfile before this hook.
const files = [
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
]
const hashes = Object.fromEntries(
  files.map((file) => [
    file,
    existsSync(file)
      ? createHash('sha256').update(readFileSync(file)).digest('hex')
      : null,
  ])
)
writeFileSync(
  join(tmpdir(), 'agent-059-dependencies.json'),
  JSON.stringify(hashes)
)
