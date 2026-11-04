import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const source = {
  source: 'nolanlawson/agent-framework-benchmark',
  sourceRevision: 'b95ada03930ca3670c8ff6377c3af815df0ac040',
  sourceSha256:
    '56a1fae810494f70e7a35aead1eaa7570c791a34afc7702842af2f4374d5c838',
}

export function patchSortHelper(content) {
  const signature = 'export async function clickHeader(header) {'
  if (!content.includes(signature))
    throw new Error('Sort helper changed upstream')
  return content.replace(
    signature,
    `${signature}\n  await header.waitFor({ state: 'visible' });`
  )
}

export async function downloadSource(destination) {
  mkdirSync(destination)
  const response = await fetch(
    `https://codeload.github.com/${source.source}/tar.gz/${source.sourceRevision}`
  )
  if (!response.ok) throw new Error(`Task download failed: ${response.status}`)
  const archive = Buffer.from(await response.arrayBuffer())
  if (
    createHash('sha256').update(archive).digest('hex') !== source.sourceSha256
  )
    throw new Error('Upstream task checksum mismatch')
  const archivePath = join(destination, 'source.tgz')
  writeFileSync(archivePath, archive)
  execFileSync('tar', [
    '-xzf',
    archivePath,
    '-C',
    destination,
    '--strip-components=1',
  ])
}

// The metrics study imports these helpers without preparing its own cwd.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const temporary = mkdtempSync(join(tmpdir(), 'pokedex-setup-'))
  const upstream = join(temporary, 'source')
  try {
    await downloadSource(upstream)
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
    cpSync(join(upstream, 'template'), process.cwd(), { recursive: true })
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    Object.assign(pkg.scripts, manifest.scripts)
    delete pkg.scripts['eval:setup']
    pkg.scripts.test = `APP_PORT=3101 ${pkg.scripts.test}`
    Object.assign(pkg.devDependencies, manifest.devDependencies)
    writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
    const helper = 'tests/specs/helpers.mjs'
    writeFileSync(helper, patchSortHelper(readFileSync(helper, 'utf8')))
    for (const args of [
      ['install', '--no-audit', '--no-fund'],
      ['run', 'setup-data'],
      ['install', '--prefix', 'app', '--no-audit', '--no-fund'],
      ['install', '--global', 'agent-browser@0.31.1'],
    ]) {
      execFileSync('npm', args, { stdio: 'inherit' })
    }
    execFileSync('agent-browser', ['install'], { stdio: 'inherit' })
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}
