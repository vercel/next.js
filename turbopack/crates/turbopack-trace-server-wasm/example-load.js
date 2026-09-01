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
new TurbopackTraceServer(trace)

console.log(`Loaded trace file: ${tracePath}`)
