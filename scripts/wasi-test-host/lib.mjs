/**
 * Test-host access to the production-owned WASI support.
 *
 * The CI job builds `packages/next` before running Rust tests, so importing its compiled CommonJS
 * output keeps environment setup, the memory contract, and link-section handling identical to the
 * production loader.
 */

import wasiRuntime from '../../packages/next/dist/build/swc/wasi-runtime.js'

export const {
  createImportedMemory,
  createReadCustomSection,
  createWasiEnvironment,
  WASI_MEMORY_INITIAL_PAGES,
  WASI_MEMORY_MAXIMUM_PAGES,
} = wasiRuntime

/** Guest path mapped to the system's real temporary directory by the test runner. */
export const WASI_TEST_TEMP_DIR = '/tmp'

/** Build the environment and preopens shared by the main instance and all pthread instances. */
export function createWasiTestEnvironment(
  env,
  cwd,
  hostTempDir,
  detectedParallelism
) {
  return {
    env: createWasiEnvironment(
      { ...env, TMPDIR: WASI_TEST_TEMP_DIR },
      detectedParallelism
    ),
    preopens: { '/': cwd, [WASI_TEST_TEMP_DIR]: hostTempDir },
  }
}
