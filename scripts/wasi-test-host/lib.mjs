/**
 * Test-host access to the production-owned WASI support.
 *
 * The CI job builds `packages/next` before running Rust tests, so importing its compiled CommonJS
 * output keeps memory parsing and link-section handling identical to the production loader.
 */

import wasiRuntime from '../../packages/next/dist/build/swc/wasi-runtime.js'

export const { createReadCustomSection, parseImportedMemory } = wasiRuntime
