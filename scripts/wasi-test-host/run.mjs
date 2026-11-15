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
import { tmpdir } from 'node:os'
import process from 'node:process'

import {
  createImportedMemory,
  createReadCustomSection,
  createWasiTestEnvironment,
} from './lib.mjs'
import { createThreadRuntime } from './spawn.mjs'

const [wasmPath, ...testArgs] = process.argv.slice(2)
if (!wasmPath) {
  console.error('usage: run.mjs <binary.wasm> [test args...]')
  process.exit(2)
}

const bytes = readFileSync(wasmPath)
const module = await WebAssembly.compile(bytes)

const memory = createImportedMemory()

// argv[0] is the program name, as a C `main` expects.
const args = [wasmPath, ...testArgs]
const { env, preopens } = createWasiTestEnvironment(
  process.env,
  process.cwd(),
  tmpdir()
)

const wasi = new WASI({
  version: 'preview1',
  args,
  env,
  // The checkout remains available at `/`; `/tmp` maps to the host's actual temp directory.
  preopens,
  returnOnExit: true,
})

/**
 * Thread ids, allocated from one counter in shared memory so that ids stay unique no matter which
 * thread does the spawning. The main thread is 0.
 */
const threadIds = new Int32Array(new SharedArrayBuffer(4))

const { threadSpawn } = createThreadRuntime({
  module,
  memory,
  threadIds,
  args,
  env,
  preopens,
  onError: (error, threadId) => {
    // A thread that dies takes the process with it, like a real aborted thread would.
    const suffix = threadId === undefined ? '' : ` ${threadId}`
    console.error(`wasi thread${suffix} failed:`, error)
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
