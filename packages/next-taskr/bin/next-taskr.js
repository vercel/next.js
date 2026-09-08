#!/usr/bin/env node
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const root = path.resolve(__dirname, '../../..')
const name = process.platform === 'win32' ? 'next-taskr.exe' : 'next-taskr'
const supplied = process.env.NEXT_TASKR_BINARY
const packaged = path.resolve(
  __dirname,
  '../dist',
  `${process.platform}-${process.arch}`,
  name
)
let activeChild
function forwardSignal(signal) {
  activeChild?.kill(signal)
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, forwardSignal.bind(null, signal))
}

function execute(binary) {
  const child = spawn(binary, process.argv.slice(2), {
    stdio: 'inherit',
    env: { ...process.env, NEXT_TASKR_NODE: process.execPath },
  })
  activeChild = child
  child.once('error', (error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  child.once('exit', (code, signal) => {
    if (signal) process.exitCode = signal === 'SIGINT' ? 130 : 143
    else process.exitCode = code ?? 1
  })
}

if (supplied || fs.existsSync(packaged)) {
  execute(supplied || packaged)
} else {
  // Source checkouts can bootstrap independently of next/dist and next-swc.
  // Always ask Cargo to check freshness, rather than executing a stale target.
  const build = spawn('cargo', ['build', '-p', 'next-taskr', '--release'], {
    cwd: root,
    stdio: 'inherit',
  })
  activeChild = build
  build.once('error', (error) => {
    console.error(
      `Unable to build next-taskr: ${error.message}. Install the repository Rust toolchain or provide NEXT_TASKR_BINARY.`
    )
    process.exitCode = 1
  })
  build.once('exit', (code, signal) => {
    if (signal) process.exitCode = signal === 'SIGINT' ? 130 : 143
    else if (code) process.exitCode = code
    else
      execute(
        path.resolve(
          root,
          process.env.CARGO_TARGET_DIR || 'target',
          'release',
          name
        )
      )
  })
}
