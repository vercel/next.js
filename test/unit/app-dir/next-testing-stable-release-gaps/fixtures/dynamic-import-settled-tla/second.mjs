import { delay } from './delay.mjs'
await delay(5)
globalThis.releaseDelayedImports.push('second')
