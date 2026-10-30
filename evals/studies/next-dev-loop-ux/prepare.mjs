import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const study = dirname(fileURLToPath(import.meta.url))
export const task = JSON.parse(readFileSync(join(study, 'task.json'), 'utf8'))

// Only the template reaches the coding agent. Gold and measurement code stay
// outside its workspace and are used by the independent verifier.
export async function prepare(destination) {
  mkdirSync(destination)
  const response = await fetch(
    `https://codeload.github.com/${task.source}/tar.gz/${task.sourceRevision}`
  )
  if (!response.ok) throw new Error(`Task download failed: ${response.status}`)
  const archive = Buffer.from(await response.arrayBuffer())
  if (
    createHash('sha256').update(archive).digest('hex') !== task.sourceSha256
  ) {
    throw new Error('Upstream task checksum mismatch')
  }
  writeFileSync(join(destination, 'source.tgz'), archive)
  const source = join(destination, 'source')
  mkdirSync(source)
  execFileSync('tar', [
    '-xzf',
    join(destination, 'source.tgz'),
    '-C',
    source,
    '--strip-components=1',
  ])
  const fixture = join(destination, 'fixture')
  cpSync(join(source, 'template'), fixture, { recursive: true })
  cpSync(join(study, 'task'), fixture, { recursive: true })
  // The upstream tests default to the same app port as next dev.
  const packagePath = join(fixture, 'package.json')
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
  pkg.scripts.test = `APP_PORT=3101 ${pkg.scripts.test}`
  writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n')
  return { source, fixture }
}
