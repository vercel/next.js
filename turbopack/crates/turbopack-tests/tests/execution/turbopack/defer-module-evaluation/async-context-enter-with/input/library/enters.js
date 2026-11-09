import { atEvaluation as nestedAtEvaluation } from './nested.js'

function readNested() {
  return nestedAtEvaluation
}

globalThis.deferEvents.push('enters')

// A store for the rest of this module's evaluation.
globalThis.deferRequest.enterWith('entered by enters.js')

export const atEvaluation = globalThis.deferRequest.getStore()
// `nested.js` is deferred too, and is evaluated here.
export const nested = readNested()
