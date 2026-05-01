#!/usr/bin/env node
//
// Build or restore the CI Playwright Docker image using turbo remote cache.
//

const { execSync } = require('child_process')
const crypto = require('crypto')
const { createHash } = crypto
const path = require('path')
const fs = require('fs')
const os = require('os')

const REPO_ROOT = path.resolve(__dirname, '..')
const IMAGE_NAME = 'nextjs-ci-playwright:latest'
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json')

const DOCKER_IMPORT_CHANGES = [
  'ENV DEBIAN_FRONTEND=noninteractive',
  'ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright',
  'WORKDIR /work',
]

const CACHE_INPUTS = [
  path.join(REPO_ROOT, 'scripts/ci-playwright.Dockerfile'),
  PACKAGE_JSON_PATH,
]

function getPlaywrightVersion() {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'))
  return pkg.devDependencies.playwright
}

function computeCacheKey() {
  const hash = createHash('sha256')
  hash.update('ci-playwright-image-v1\0')
  hash.update(`arch:${os.arch()}\0`)

  for (const file of CACHE_INPUTS) {
    hash.update(file + '\0')
    hash.update(fs.readFileSync(file))
  }

  return hash.digest('hex')
}

function buildImage() {
  const playwrightVersion = getPlaywrightVersion()
  console.log(`Building Docker image: ${IMAGE_NAME}`)
  const ctx = fs.mkdtempSync(path.join(os.tmpdir(), 'next-ci-playwright-'))

  try {
    execSync(
      `docker build --build-arg PLAYWRIGHT_VERSION=${playwrightVersion} -t ${IMAGE_NAME} -f ${path.join(
        REPO_ROOT,
        'scripts/ci-playwright.Dockerfile'
      )} ${ctx}`,
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

  if (!process.env.TURBO_TOKEN) {
    console.log('No TURBO_TOKEN — building without cache')
    buildImage()
    return
  }

  const hit = await cache.exists(key)
  console.log(hit ? 'Cache HIT' : 'Cache MISS')

  if (hit) {
    const zstFile = tmpFile('ci-playwright-image-cache.tar.zst')
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

  buildImage()

  const zstFile = tmpFile('ci-playwright-image-cache.tar.zst')
  const containerName = `next-ci-playwright-export-${process.pid}`

  try {
    sh(`docker create --name ${containerName} ${IMAGE_NAME} true`)
    sh(`docker export ${containerName} | zstd -1 -T0 --long=27 -o ${zstFile}`)
    sh(`docker rm ${containerName}`)

    try {
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
