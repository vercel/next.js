#!/usr/bin/env node
/**
 * Cargo target runner for `wasm32-wasip1-threads` test binaries that link `turbo-tasks`.
 *
 *   export CARGO_TARGET_WASM32_WASIP1_THREADS_RUNNER="node scripts/wasi-test-host/run.mjs"
 *   cargo test -p turbo-tasks --lib --target wasm32-wasip1-threads
 *
 * See ./README.md for why this exists. In short: `turbo-tasks` needs an `env.read_custom_section`
 * host import that no stock runtime provides, so the binaries build but cannot be executed.
 */

import { WASI } from 'node:wasi'
import { readFileSync } from 'node:fs'
import process from 'node:process'

import { createReadCustomSection, parseImportedMemory } from './lib.mjs'
import { createThreadSpawn } from './spawn.mjs'

const [wasmPath, ...testArgs] = process.argv.slice(2)
if (!wasmPath) {
  console.error('usage: run.mjs <binary.wasm> [test args...]')
  process.exit(2)
}

const bytes = readFileSync(wasmPath)
const module = await WebAssembly.compile(bytes)

const memoryImport = parseImportedMemory(bytes)
if (memoryImport.maximum === undefined) {
  // Shared memories must declare a maximum, and threads need a shared memory.
  throw new Error(
    'imported memory declares no maximum; cannot create a shared memory for it'
  )
}
const memory = new WebAssembly.Memory({
  initial: memoryImport.initial,
  maximum: memoryImport.maximum,
  shared: memoryImport.shared,
})

// argv[0] is the program name, as a C `main` expects.
const args = [wasmPath, ...testArgs]

const wasi = new WASI({
  version: 'preview1',
  args,
  env: process.env,
  // Tests may touch the filesystem (tempfiles, fixtures); expose the working directory only.
  preopens: { '/': process.cwd() },
  returnOnExit: true,
})

/**
 * Thread ids, allocated from one counter in shared memory so that ids stay unique no matter which
 * thread does the spawning. The main thread is 0.
 */
const threadIds = new Int32Array(new SharedArrayBuffer(4))

const threadSpawn = createThreadSpawn({
  bytes,
  memory,
  threadIds,
  args,
  cwd: process.cwd(),
  onError: (error, threadId) => {
    // A thread that dies takes the process with it, like a real aborted thread would.
    console.error(`wasi thread ${threadId} failed:`, error)
    process.exit(1)
  },
})

const instance = await WebAssembly.instantiate(module, {
  ...wasi.getImportObject(),
  env: {
    memory,
    read_custom_section: createReadCustomSection(module, memory),
  },
  wasi: {
    'thread-spawn': threadSpawn,
  },
})

// `wasi.start` runs `_start` and returns the exit code (`returnOnExit`).
const exitCode = wasi.start(instance)

process.exit(exitCode ?? 0)
