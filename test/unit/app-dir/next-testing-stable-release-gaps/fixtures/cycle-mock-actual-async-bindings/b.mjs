import * as a from './a.mjs'
import { ready } from './unrelated.mjs'
await Promise.resolve()
globalThis.cyclicOriginalReady = true
export const value = 1
export const readName = () => a.name
export const readNamespace = () => a
export const dependencyReady = ready
