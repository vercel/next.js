const { readFileSync } = require('node:fs')
const {
  TurbopackTraceServer,
} = require('./js/turbopack-trace-server-wasm.wasi.cjs')

const tracePath = process.argv[2]

if (!tracePath) {
  console.error(`Usage: node ${process.argv[1]} <trace-file>`)
  process.exit(1)
}

const trace = readFileSync(tracePath)
new TurbopackTraceServer(trace, (progress) => {
  const line = `${progress.percentage.toFixed(0)}% read (${(
    progress.bytesRead /
    1024 /
    1024
  ).toFixed(0)}/${(progress.totalBytes / 1024 / 1024).toFixed(0)} MB, ${(
    progress.bytesPerSecond /
    1024 /
    1024
  ).toFixed(0)} MB/s) - ${progress.stats}`
  if (process.stderr.isTTY) {
    process.stderr.write(`\r\x1b[2K${line}${progress.done ? '\n' : ''}`)
  } else {
    console.error(line)
  }
})

console.log(`Loaded trace file: ${tracePath}`)
