#!/usr/bin/env node
// @ts-check
//
// Build or restore the next-swc-builder Docker image.
//
// This script is both a turbo task AND a post-turbo loader:
//
// 1. `pnpm -F @next/swc build-docker-image` (turbo task):
//    - On cache miss: turbo runs this script, which builds the image and saves
//      target/docker-image.tar for turbo to cache as output.
//    - On cache hit: turbo restores target/docker-image.tar and SKIPS this script.
//
// 2. `node scripts/docker-image-cache.js --load` (post-turbo step):
//    - If target/docker-image.tar exists (turbo cache hit), loads it into docker.
//    - If the image is already loaded, does nothing.
//    - Cleans up the tar after loading.
//
// Usage:
//   node scripts/docker-image-cache.js           # build image + save tar (turbo task)
//   node scripts/docker-image-cache.js --load    # load tar into docker if present
//   node scripts/docker-image-cache.js --force   # always rebuild

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

const { parseArgs } = require('node:util')
const { values: flags } = parseArgs({
  args: process.argv.slice(2),
  options: {
    force: { type: 'boolean', default: false },
    load: { type: 'boolean', default: false },
  },
})

const REPO_ROOT = path.resolve(__dirname, '..')
const IMAGE_NAME = 'next-swc-builder:latest'
const IMAGE_TAR = path.join(REPO_ROOT, 'target/docker-image.tar')
const force = flags.force
const load = flags.load

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

if (load) {
  // Post-turbo step: load the cached tar if present, or build if missing
  if (imageExists() && !force) {
    console.log('Docker image already loaded')
  } else if (fs.existsSync(IMAGE_TAR)) {
    console.log('Loading Docker image from turbo cache...')
    execSync(`docker load -i ${IMAGE_TAR}`, { stdio: 'inherit' })
    fs.unlinkSync(IMAGE_TAR)
    console.log('Docker image restored from cache')
  } else {
    console.log('No cached image — building from scratch')
    buildImage()
  }
} else {
  // Turbo task: build and save tar for caching
  if (force && fs.existsSync(IMAGE_TAR)) fs.unlinkSync(IMAGE_TAR)
  if (!imageExists() || force) {
    buildImage()
  }
  if (!fs.existsSync(IMAGE_TAR)) {
    console.log('Saving Docker image for turbo cache...')
    fs.mkdirSync(path.dirname(IMAGE_TAR), { recursive: true })
    execSync(`docker save ${IMAGE_NAME} -o ${IMAGE_TAR}`, { stdio: 'inherit' })
    const size = fs.statSync(IMAGE_TAR).size
    console.log(`Saved: ${(size / 1024 / 1024).toFixed(0)} MB`)
  }
}
