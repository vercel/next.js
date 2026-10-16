/** Test-host access to the production-owned WASI thread manager. */

import wasiRuntime from '../../packages/next/dist/build/swc/wasi-runtime.js'

export const { createThreadRuntime, nextThreadId } = wasiRuntime
