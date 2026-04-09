#!/usr/bin/env node
//
// Cache the compiled next-swc .node binary in the turbo remote cache.
//
// Uses the turbo-computed rust fingerprint (target/.rust-fingerprint) as
// the cache key, combined with the target triple. Run `turbo run
// rust-fingerprint` first to compute it.
//
// Usage:
//   node scripts/native-cache.js --restore --target x86_64-unknown-linux-gnu
//   node scripts/native-cache.js --save    --target x86_64-unknown-linux-gnu

const { execSync } = require('child_process')
const { createHash } = require('crypto')
const path = require('path')
const fs = require('fs')
const os = require('os')

const { parseArgs } = require('node:util')
const { values: flags } = parseArgs({
  args: process.argv.slice(2),
  options: {
    restore: { type: 'boolean', default: false },
    save: { type: 'boolean', default: false },
    target: { type: 'string', default: '' },
  },
  strict: false,
})

const REPO_ROOT = path.resolve(__dirname, '..')
const NATIVE_DIR = path.join(REPO_ROOT, 'packages/next-swc/native')
const FINGERPRINT = path.join(REPO_ROOT, 'target/.rust-fingerprint')

function computeCacheKey() {
  if (!fs.existsSync(FINGERPRINT)) {
    console.error(
      'target/.rust-fingerprint not found — run `turbo run rust-fingerprint` first'
    )
    process.exit(1)
  }
  const turboHash = fs.readFileSync(FINGERPRINT, 'utf-8').trim()
  // Combine turbo's input hash with the target triple for a unique key.
  // Must be hex-only (turbo cache API requirement).
  const hash = createHash('sha256')
  hash.update(`native-cache-v1\0`)
  hash.update(`turbo=${turboHash}\0`)
  hash.update(`target=${flags.target}\0`)
  return hash.digest('hex')
}

function tmpFile(name) {
  return path.join(process.env.RUNNER_TEMP || os.tmpdir(), name)
}

function sh(cmd) {
  execSync(cmd, { stdio: 'inherit', shell: true })
}

async function restore() {
  const cache = await import('./turbo-cache.mjs')
  const key = computeCacheKey()
  console.log(`Native cache key: ${key.slice(0, 16)}...`)
  console.log(`  target: ${flags.target}`)

  if (!process.env.TURBO_TOKEN) {
    console.log('No TURBO_TOKEN — skipping cache restore')
    return false
  }

  const hit = await cache.exists(key)
  if (!hit) {
    console.log('Native cache MISS')
    return false
  }

  console.log('Native cache HIT — downloading...')
  const tarFile = tmpFile('native-cache.tar.zst')
  const ok = await cache.getToFile(key, tarFile)
  if (!ok) {
    console.log('Download failed')
    return false
  }

  const size = fs.statSync(tarFile).size
  console.log(`Downloaded ${(size / 1024 / 1024).toFixed(0)} MB`)
  fs.mkdirSync(NATIVE_DIR, { recursive: true })
  sh(`zstd -d -c "${tarFile}" | tar xf - -C "${NATIVE_DIR}"`)
  fs.unlinkSync(tarFile)

  // Verify
  const nodes = fs.readdirSync(NATIVE_DIR).filter((f) => f.endsWith('.node'))
  if (nodes.length > 0) {
    console.log(`Restored: ${nodes.join(', ')}`)
    return true
  }
  console.log('WARNING: tar extracted but no .node files found')
  return false
}

async function save() {
  const cache = await import('./turbo-cache.mjs')
  const key = computeCacheKey()
  console.log(`Native cache key: ${key.slice(0, 16)}...`)

  if (!process.env.TURBO_TOKEN) {
    console.log('No TURBO_TOKEN — skipping cache save')
    return
  }

  const nodes = fs.existsSync(NATIVE_DIR)
    ? fs.readdirSync(NATIVE_DIR).filter((f) => f.endsWith('.node'))
    : []
  if (nodes.length === 0) {
    console.log('No .node files to cache')
    return
  }

  if (await cache.exists(key)) {
    console.log('Already cached — skipping')
    return
  }

  const tarFile = tmpFile('native-cache.tar.zst')
  const fileList = nodes.join(' ')
  sh(`tar cf - -C "${NATIVE_DIR}" ${fileList} | zstd -3 -T0 -o "${tarFile}"`)

  const size = fs.statSync(tarFile).size
  console.log(
    `Compressed: ${(size / 1024 / 1024).toFixed(0)} MB — uploading...`
  )

  try {
    await cache.put(key, tarFile)
    console.log('Native cache saved')
  } catch (e) {
    console.log(`WARNING: Failed to save: ${e.message}`)
  }

  fs.unlinkSync(tarFile)
}

async function main() {
  if (flags.restore) {
    const ok = await restore()
    process.exit(ok ? 0 : 1)
  } else if (flags.save) {
    await save()
  } else {
    console.error('Usage: --restore or --save (with --target)')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
