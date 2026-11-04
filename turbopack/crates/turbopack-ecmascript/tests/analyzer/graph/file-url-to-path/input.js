import { dirname, join } from 'node:path'
import * as url from 'node:url'
import { fileURLToPath } from 'node:url'

// `fileURLToPath(import.meta.url)` has the same value as `__filename`
const filename = fileURLToPath(import.meta.url)
const namespaced = url.fileURLToPath(import.meta.url)
const cjsFilename = __filename

const workerPath = join(dirname(fileURLToPath(import.meta.url)), 'worker.cjs')
const cjsWorkerPath = join(dirname(__filename), 'worker.cjs')

const nonConstant = fileURLToPath(globalThis.foo)
