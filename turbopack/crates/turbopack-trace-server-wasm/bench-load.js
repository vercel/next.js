const { createReadStream, statSync } = require('node:fs')
const { availableParallelism } = require('node:os')
const {
  configureRayonThreadPool,
  TurbopackTraceServer,
} = require('./js/turbopack-trace-server-wasm.wasi.cjs')

const tracePath = process.argv[2]

if (!tracePath) {
  console.error(`Usage: node ${process.argv[1]} <trace-file>`)
  process.exit(1)
}

const requestedThreadCount = Number.parseInt(process.env.RAYON_NUM_THREADS, 10)
configureRayonThreadPool(
  requestedThreadCount > 0 ? requestedThreadCount : availableParallelism()
)

const size = statSync(tracePath).size

const server = new TurbopackTraceServer((progress) => {
  const percentage = size > 0 ? (progress.bytesRead * 100) / size : 100
  const line = `${percentage.toFixed(0)}% read (${(
    progress.bytesRead /
    1024 /
    1024
  ).toFixed(0)}/${(size / 1024 / 1024).toFixed(0)} MB, ${(
    progress.bytesPerSecond /
    1024 /
    1024
  ).toFixed(0)} MB/s) - ${progress.stats}`
  if (process.stderr.isTTY) {
    process.stderr.write(`\r\x1b[2K${line}`)
  } else {
    console.error(line)
  }
})

async function load() {
  const started = performance.now()
  for await (const chunk of createReadStream(tracePath, {
    highWaterMark: 4 * 1024 * 1024,
  })) {
    server.read(chunk)
  }
  const line = `Initial read completed (${Math.floor(
    size / 1024 / 1024
  )} MB, ${((performance.now() - started) / 1000).toFixed(1)}s)`
  if (process.stderr.isTTY) {
    process.stderr.write(`\r\x1b[2K${line}\n`)
  } else {
    console.error(line)
  }
  console.log(`Loaded trace file: ${tracePath}`)
}

load().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
