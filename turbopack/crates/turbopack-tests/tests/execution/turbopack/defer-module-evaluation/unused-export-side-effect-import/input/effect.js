import { value } from './library/free.js'

globalThis.deferEvents.push('effect')

// Nothing uses this export, so the import of `free.js` is removed.
export function unused() {
  return value.atEvaluation
}
