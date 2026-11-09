import * as library from './library/top-level-read.js'
import {
  atEvaluation as imported,
  inFunction as read,
} from './library/top-level-read.js'

globalThis.deferEvents.push('later-top-level-read')

// One export is read here, at the top level. Another export and the namespace object are only
// used inside a function.
export const atEvaluation = {
  importer: globalThis.deferRequest.getStore(),
  imported,
}

export function inFunction() {
  return [read.atEvaluation, Object.keys(library)]
}
