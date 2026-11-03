// Spawned by benchmark.ts once per sharp variant. Plain CommonJS so it can be
// started with a bare `node` and so the `require('sharp')` hook below is in
// place before anything loads `next/image-optimizer-transform`.
//
// The hook redirects the single `require('sharp')` made by
// packages/next/dist/server/image-optimizer/transform.js to an isolated npm
// install (native or `--cpu=wasm32`). Everything else, including the resize /
// encode pipeline in `optimizeImage()`, is the code `next start` runs.

const Module = require('node:module')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))

const sharpEntry = require.resolve('sharp', { paths: [config.sharpDir] })
const originalResolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'sharp') {
    return sharpEntry
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

const transformPath = require.resolve('next/image-optimizer-transform', {
  paths: [config.repoRoot],
})

async function main() {
  const loadStart = process.hrtime.bigint()
  const { optimizeImage, getSharp } = require(transformPath)
  // Mirrors the first `optimizeImage()` call in a `next start` process: the
  // module is loaded (for wasm32 this compiles and instantiates the binary)
  // and configured exactly once.
  const sharp = getSharp(config.concurrency, config.operationCache)
  const loadMs = Number(process.hrtime.bigint() - loadStart) / 1e6
  if (config.concurrency !== null) {
    // `getSharp()` only applies `imgOptConcurrency` when sharp's default
    // concurrency is above 1, which it is not on glibc-based Linux (sharp
    // defaults to a single thread there, for both bindings). An explicit
    // --concurrency is meant to measure threading, so set it unconditionally.
    sharp.concurrency(config.concurrency)
  }

  // `@img/sharp-libvips-*` only carries the shared library, the binding is
  // the `@img/sharp-<platform>` or `@img/sharp-wasm32` package.
  const bindingPattern = /[\\/]@img[\\/](sharp-(?!libvips-)[^\\/]+)[\\/]/
  const loadedBinding = Object.keys(require.cache).find((file) =>
    bindingPattern.test(file)
  )
  const bindingPackage = loadedBinding
    ? loadedBinding.match(bindingPattern)[1]
    : 'unknown'
  const isWasm = bindingPackage === 'sharp-wasm32'
  if (isWasm !== (config.variant === 'wasm')) {
    throw new Error(
      `The ${config.variant} variant loaded @img/${bindingPackage} (${loadedBinding}); refusing to benchmark the wrong binding`
    )
  }

  const environment = {
    bindingPackage,
    isWasm,
    sharpEntry,
    versions: sharp.versions,
    concurrency: sharp.concurrency(),
    cache: sharp.cache(),
    simd: sharp.simd(),
    loadMs,
  }

  const inputs = new Map()
  const results = []
  for (const job of config.jobs) {
    if (!inputs.has(job.imagePath)) {
      inputs.set(job.imagePath, fs.readFileSync(job.imagePath))
    }
    const input = inputs.get(job.imagePath)
    const durationsMs = []
    const errors = []
    let output = null
    let peakRss = 0
    for (let i = 0; i < config.warmup + config.iterations; i++) {
      // A fresh copy per iteration so nothing keyed on the input pointer (the
      // libvips operation cache, if enabled) can short-circuit the work.
      const buffer = Buffer.from(input)
      const start = process.hrtime.bigint()
      try {
        output = await optimizeImage({
          buffer,
          contentType: job.outputType,
          quality: config.quality,
          width: job.width,
          concurrency: config.concurrency,
          operationCache: config.operationCache,
          limitInputPixels: config.limitInputPixels,
          sequentialRead: config.sequentialRead,
          timeoutInSeconds: config.timeoutInSeconds,
          mozjpeg: config.mozjpeg,
        })
      } catch (error) {
        output = null
        errors.push(String(error && error.message ? error.message : error))
      }
      const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6
      if (i >= config.warmup) {
        durationsMs.push(elapsedMs)
      }
      peakRss = Math.max(peakRss, process.memoryUsage().rss)
    }

    let outputFile = null
    let outputBytes = null
    let outputSha256 = null
    if (output) {
      outputBytes = output.byteLength
      outputSha256 = crypto.createHash('sha256').update(output).digest('hex')
      outputFile = path.join(config.outputDir, `${job.id}.${job.outputExt}`)
      fs.writeFileSync(outputFile, output)
    }

    results.push({
      id: job.id,
      durationsMs,
      errors,
      outputBytes,
      outputSha256,
      outputFile,
      peakRssBytes: peakRss,
    })
    process.stderr.write(
      `  ${config.variant.padEnd(6)} ${job.id}: ${
        output
          ? `${median(durationsMs).toFixed(1)}ms median, ${outputBytes} bytes`
          : `failed (${errors[errors.length - 1]})`
      }\n`
    )
  }

  fs.writeFileSync(
    config.resultFile,
    JSON.stringify(
      {
        variant: config.variant,
        environment,
        maxRssBytes: process.resourceUsage().maxRSS * 1024,
        results,
      },
      null,
      2
    )
  )
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
