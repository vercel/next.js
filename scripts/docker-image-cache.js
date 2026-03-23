#!/usr/bin/env node
// @ts-check
//
// Build or restore the next-swc-builder Docker image.
//
// When run as a turbo task (`pnpm -F @next/swc build-docker-image`), turbo
// handles caching automatically: if the inputs (Dockerfile, rust-toolchain.toml,
// docker-native-build.sh) haven't changed, the cached docker/image.tar is
// restored and we just `docker load` it. On cache miss, we build from scratch
// and `docker save` so turbo can cache the output.
//
// Usage:
//   node scripts/docker-image-cache.js          # build or load from cache
//   node scripts/docker-image-cache.js --force   # always rebuild

'use strict'

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

const REPO_ROOT = path.resolve(__dirname, '..')
const IMAGE_NAME = 'next-swc-builder:latest'
const IMAGE_TAR = path.join(REPO_ROOT, 'docker/image.tar')
const force = process.argv.includes('--force')

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
      `docker build -t ${IMAGE_NAME} -f ${path.join(REPO_ROOT, 'docker/native-builder.Dockerfile')} ${ctx}`,
      { stdio: 'inherit' }
    )
  } finally {
    fs.rmSync(ctx, { recursive: true, force: true })
  }
}

// If turbo restored docker/image.tar from cache, load it
if (!force && fs.existsSync(IMAGE_TAR)) {
  console.log('Loading Docker image from turbo cache...')
  execSync(`docker load -i ${IMAGE_TAR}`, { stdio: 'inherit' })
  // Clean up — we don't need the tar on disk after loading
  fs.unlinkSync(IMAGE_TAR)
  console.log('Docker image restored from cache')
} else {
  // Cache miss or --force: build from scratch
  if (force && fs.existsSync(IMAGE_TAR)) fs.unlinkSync(IMAGE_TAR)
  buildImage()
  // Save for turbo to cache as output
  console.log(`Saving Docker image for turbo cache...`)
  execSync(`docker save ${IMAGE_NAME} -o ${IMAGE_TAR}`, { stdio: 'inherit' })
  const size = fs.statSync(IMAGE_TAR).size
  console.log(`Saved: ${(size / 1024 / 1024).toFixed(0)} MB`)
}
