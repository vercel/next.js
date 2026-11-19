import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { answer } from 'my-wasm-dep'

const require = createRequire(import.meta.url)

// The glue path is computed at runtime, so a bundler can't statically resolve it. This only works
// when the package is external, i.e. loaded by Node.js from its real location on disk.
const GLUE_PATH = fileURLToPath(new URL('../wasm/my_wasm.cjs', import.meta.url))
const glue = require(GLUE_PATH)

export { answer }
export const moduleUrl = import.meta.url
export const wasmPath = glue.wasmPath
export const add = glue.add
