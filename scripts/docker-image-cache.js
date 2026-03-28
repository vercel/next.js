#!/usr/bin/env node
//
// Build or restore the next-swc-builder Docker image using turbo remote cache.
//
// Computes a cache key from the Dockerfile + rust-toolchain.toml contents,
// then checks the turbo cache API via scripts/turbo-cache.js.
// Images are compressed with zstd before upload (~2.8GB → ~500MB).
//
// Usage:
//   node scripts/docker-image-cache.js           # restore from cache or build + upload
//   node scripts/docker-image-cache.js --force   # always rebuild and re-upload

const { execSync } = require('child_process')
const { createHash } = require('crypto')
const path = require('path')
const fs = require('fs')
const os = require('os')
const cache = require('./turbo-cache')

const { parseArgs } = require('node:util')
const { values: flags } = parseArgs({
  args: process.argv.slice(2),
  options: {
    force: { type: 'boolean', default: false },
  },
  strict: false,
})

const REPO_ROOT = path.resolve(__dirname, '..')
const IMAGE_NAME = 'next-swc-builder:latest'

// Files that determine the docker image content — if any change, rebuild.
const CACHE_INPUTS = [
  path.join(REPO_ROOT, 'scripts/native-builder.Dockerfile'),
  path.join(REPO_ROOT, 'rust-toolchain.toml'),
]

function computeCacheKey() {
  // Turbo cache keys must be hex-only (^[a-fA-F0-9]+$).
  const hash = createHash('sha256')
  hash.update('docker-image-v2\0')
  for (const file of CACHE_INPUTS) {
    hash.update(file + '\0')
    hash.update(fs.readFileSync(file))
  }
  return hash.digest('hex')
}

function imageExists() {
  try {
    execSync(`docker image inspect ${IMAGE_NAME}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function buildImage() {
  console.log(`Building Docker image: ${IMAGE_NAME}`)
  const ctx = fs.mkdtempSync(path.join(os.tmpdir(), 'next-swc-docker-'))
  fs.copyFileSync(
    path.join(REPO_ROOT, 'rust-toolchain.toml'),
    path.join(ctx, 'rust-toolchain.toml')
  )
  try {
    execSync(
      `docker build -t ${IMAGE_NAME} -f ${path.join(REPO_ROOT, 'scripts/native-builder.Dockerfile')} ${ctx}`,
      { stdio: 'inherit' }
    )
  } finally {
    fs.rmSync(ctx, { recursive: true, force: true })
  }
}

function tmpFile(name) {
  return path.join(process.env.RUNNER_TEMP || os.tmpdir(), name)
}

function sh(cmd) {
  execSync(cmd, { stdio: 'inherit', shell: '/bin/bash' })
}

async function main() {
  const key = computeCacheKey()
  console.log(`Docker image cache key: ${key}`)

  if (!process.env.TURBO_TOKEN) {
    console.log('No TURBO_TOKEN — building without cache')
    if (!imageExists()) buildImage()
    return
  }

  // Try to restore from cache (unless --force)
  if (!flags.force) {
    const hit = await cache.exists(key)
    console.log(hit ? 'Cache HIT' : 'Cache MISS')

    if (hit) {
      const zstdFile = tmpFile('docker-image-cache.tar.zst')
      const ok = await cache.getToFile(key, zstdFile)
      if (ok) {
        const size = fs.statSync(zstdFile).size
        console.log(
          `Downloaded ${(size / 1024 / 1024).toFixed(0)} MB compressed`
        )
        try {
          sh(`zstd -d -c ${zstdFile} | docker load`)
          fs.unlinkSync(zstdFile)
          console.log('Docker image restored from turbo cache')
          return
        } catch (e) {
          console.log(`WARNING: Failed to restore image: ${e.message}`)
          console.log('Discarding cached image and rebuilding from scratch')
          try { fs.unlinkSync(zstdFile) } catch {}
          // Remove the partially-loaded image if it exists
          try {
            execSync(`docker rmi -f ${IMAGE_NAME}`, { stdio: 'ignore' })
          } catch {}
        }
      }
    }
  }

  // Cache miss or --force: always rebuild since inputs changed
  buildImage()

  // Compress and upload
  console.log('Compressing docker image with zstd...')
  const zstdFile = tmpFile('docker-image-cache.tar.zst')
  sh(`docker save ${IMAGE_NAME} | zstd -3 -T0 -o ${zstdFile}`)

  const size = fs.statSync(zstdFile).size
  console.log(
    `Compressed: ${(size / 1024 / 1024).toFixed(0)} MB — uploading...`
  )

  try {
    // Stream upload from file (avoids 2GB Buffer limit)
    await cache.put(key, zstdFile)
    console.log('Docker image uploaded to turbo cache')
  } catch (e) {
    console.log(`WARNING: Failed to upload: ${e.message}`)
  }

  fs.unlinkSync(zstdFile)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
