import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export function repoRoot() {
  // bench/deopt/src -> repo root
  return path.resolve(import.meta.dirname, '../../..')
}

export function nextBin() {
  return path.join(repoRoot(), 'packages/next/dist/bin/next')
}

export function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

/**
 * Content hash of a fixture directory (excluding build output), used to skip
 * rebuilds when nothing changed.
 */
export function hashDir(dir, { exclude = ['.next', 'node_modules'] } = {}) {
  const hash = crypto.createHash('sha1')
  const walk = (current) => {
    const entries = fs
      .readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile()) {
        hash.update(path.relative(dir, full))
        hash.update('\0')
        hash.update(fs.readFileSync(full))
        hash.update('\0')
      }
    }
  }
  walk(dir)
  return hash.digest('hex')
}

/**
 * Fast fingerprint of the built next package (path + size + mtime of every
 * file in packages/next/dist). Editing Next.js source and rebuilding changes
 * dist mtimes, which must invalidate fixture build caches — a fixture built
 * against stale dist silently measures the wrong code.
 */
export function nextDistFingerprint() {
  const dist = path.join(repoRoot(), 'packages/next/dist')
  const hash = crypto.createHash('sha1')
  let entries
  try {
    entries = fs.readdirSync(dist, { recursive: true })
  } catch {
    return 'no-dist'
  }
  entries.sort()
  for (const rel of entries) {
    let stat
    try {
      stat = fs.statSync(path.join(dist, rel))
    } catch {
      continue
    }
    if (!stat.isFile()) continue
    hash.update(String(rel))
    hash.update('\0')
    hash.update(String(stat.size))
    hash.update('\0')
    hash.update(String(stat.mtimeMs))
    hash.update('\0')
  }
  return hash.digest('hex')
}

export async function getFreePort() {
  const net = await import('node:net')
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

export async function waitFor(
  fn,
  { timeoutMs = 60_000, intervalMs = 250, description = 'condition' } = {}
) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const result = await fn()
      if (result) return result
    } catch (err) {
      lastError = err
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(
    `Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`
  )
}
