import { shared } from './library/shared.js'
import { helper } from './helper.js'

globalThis.deferEvents.push('later')

// Read while this module is evaluated: `shared.js` is imported eagerly.
export const atEvaluation = [
  shared.atEvaluation,
  helper.atEvaluation,
  globalThis.deferRequest.getStore(),
]
