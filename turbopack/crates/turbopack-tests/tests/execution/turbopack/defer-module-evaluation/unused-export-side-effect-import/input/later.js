import { value } from './library/free.js'
import './effect.js'

globalThis.deferEvents.push('later')

// Read while this module is evaluated: `free.js` is imported eagerly.
export const atEvaluation = [
  value.atEvaluation,
  globalThis.deferRequest.getStore(),
]
