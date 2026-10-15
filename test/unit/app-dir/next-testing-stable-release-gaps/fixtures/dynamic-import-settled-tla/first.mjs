import { delay } from './delay.mjs'
await delay(15)
globalThis.releaseDelayedImports = ['first']
void import('./second.mjs')
