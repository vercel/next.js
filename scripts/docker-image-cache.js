#!/usr/bin/env node
//
// Build or restore the next-swc-builder Docker image using turbo remote cache.
//
// Computes a cache key from the Dockerfile + rust-toolchain.toml contents,
// then checks the turbo cache API via scripts/turbo-cache.mjs.
// Uses docker export/import (flat filesystem) instead of save/load (layered)
// to avoid including redundant base image layers. Compressed with zstd.
//
// Usage:
//   node scripts/docker-image-cache.js           # restore from cache or build + upload
//   node scripts/docker-image-cache.js --force   # always rebuild and re-upload

const { execSync } = require('child_process')
const crypto = require('crypto')
const { createHash } = crypto
const path = require('path')
const fs = require('fs')
const os = require('os')

const { parseArgs } = require('node:util')
const { values: flags } = parseArgs({
  args: process.argv.slice(2),
  options: {
    force: { type: 'boolean', default: false },
  },
})

const REPO_ROOT = path.resolve(__dirname, '..')
const IMAGE_NAME = 'next-swc-builder:latest'

// docker export/import strips all image metadata. These --change flags
// restore the ENV and WORKDIR that the Dockerfile sets, so that tools
// like cargo, rustc, napi, sccache are found in PATH.
const DOCKER_IMPORT_CHANGES = [
  'ENV PATH=/root/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  'ENV DEBIAN_FRONTEND=noninteractive',
  'WORKDIR /build',
]

// Files baked into the Docker image — only these affect the image content.
// Scripts that run on the host (docker-image-cache.js, docker-native-build.*)
// are NOT included since they're mounted at runtime, not COPY'd.
const CACHE_INPUTS = [
  path.join(REPO_ROOT, 'scripts/native-builder.Dockerfile'),
  path.join(REPO_ROOT, 'rust-toolchain.toml'),
]

function computeCacheKey() {
  // Turbo cache keys must be hex-only (^[a-fA-F0-9]+$).
  const hash = createHash('sha256')
  hash.update('docker-image-v4\0')
  // Include host architecture — the image contains native binaries
  // (Rust toolchain, cargo-xwin, etc.) that are arch-specific.
  hash.update(`arch:${os.arch()}\0`)
  for (const file of CACHE_INPUTS) {
    hash.update(file + '\0')
    hash.update(fs.readFileSync(file))
  }
  return hash.digest('hex')
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
  const suffix = crypto.randomBytes(6).toString('hex')
  return path.join(process.env.RUNNER_TEMP || os.tmpdir(), `${name}.${suffix}`)
}

function sh(cmd) {
  execSync(cmd, { stdio: 'inherit', shell: true })
}

async function main() {
  const cache = await import('./turbo-cache.mjs')
  const key = computeCacheKey()
  // Show redacted endpoint for debugging (scheme + first 2 chars of host)
  const apiUrl = new URL(process.env.TURBO_API || 'https://vercel.com')
  const redactedApi = `${apiUrl.protocol}//${apiUrl.hostname.slice(0, 2)}***`
  console.log(`Docker image: ${IMAGE_NAME}`)
  console.log(`Cache key: ${key}`)
  console.log(`Cache endpoint: ${redactedApi}`)

  if (!process.env.TURBO_TOKEN) {
    console.log('No TURBO_TOKEN — building without cache')
    buildImage()
    return
  }

  // Try to restore from cache (unless --force)
  if (!flags.force) {
    const hit = await cache.exists(key)
    console.log(hit ? 'Cache HIT' : 'Cache MISS')

    if (hit) {
      const zstFile = tmpFile('docker-image-cache.tar.zst')
      let restored = false
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(
            `Downloading cached image${attempt > 1 ? ` (retry ${attempt})` : ''}...`
          )
          const result = await cache.getToFile(key, zstFile, { retries: 0 })
          if (!result.ok) throw new Error('download failed')
          if (result.stats) {
            console.log(`Downloaded: ${cache.formatStats(result.stats)}`)
          }
          console.log('Decompressing and importing into Docker...')
          const changeFlags = DOCKER_IMPORT_CHANGES.map(
            (c) => `--change '${c}'`
          ).join(' ')
          sh(
            `zstd -d -c --long=27 --threads=0 ${zstFile} | docker import ${changeFlags} - ${IMAGE_NAME}`
          )
          console.log('Docker image restored from turbo cache')
          restored = true
          break
        } catch (e) {
          console.log(`WARNING: Attempt ${attempt} failed: ${e.message}`)
          try {
            execSync(`docker rmi -f ${IMAGE_NAME}`, { stdio: 'ignore' })
          } catch {}
        } finally {
          try {
            fs.unlinkSync(zstFile)
          } catch {}
        }
      }
      if (restored) return
      console.log('All restore attempts failed — rebuilding from scratch')
    }
  }

  // Cache miss or --force: always rebuild since inputs changed
  buildImage()

  // Export and compress with zstd (docker export produces uncompressed tar).
  const zstFile = tmpFile('docker-image-cache.tar.zst')
  const containerName = `next-swc-export-${process.pid}`
  try {
    sh(`docker create --name ${containerName} ${IMAGE_NAME} true`)
    sh(`docker export ${containerName} | zstd -1 -T0 --long=27 -o ${zstFile}`)
    sh(`docker rm ${containerName}`)

    const size = fs.statSync(zstFile).size
    console.log(
      `Exported + compressed: ${(size / 1024 / 1024).toFixed(0)} MB — uploading...`
    )

    try {
      // Stream upload from file (avoids 2GB Buffer limit)
      await cache.put(key, zstFile)
      console.log('Docker image uploaded to turbo cache')
    } catch (e) {
      console.log(`WARNING: Failed to upload: ${e.message}`)
    }
  } finally {
    try {
      fs.unlinkSync(zstFile)
    } catch {}
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
