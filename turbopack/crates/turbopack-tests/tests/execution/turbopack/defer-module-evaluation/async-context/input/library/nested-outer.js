import { inner } from './nested-inner.js'

globalThis.deferEvents.push('nested-outer')

function readInner() {
  return inner
}

export const outer = globalThis.deferRequest.getStore()
// The first read of a deferred import, while this module is evaluated.
export const innerAtEvaluation = readInner()
