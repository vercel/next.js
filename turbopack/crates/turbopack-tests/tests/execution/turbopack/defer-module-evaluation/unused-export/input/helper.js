import { shared } from './library/shared.js'

globalThis.deferEvents.push('helper')

export const helper = { atEvaluation: globalThis.deferRequest.getStore() }

// Nothing uses this export, so the import of `shared.js` is removed.
export function unused() {
  return shared.atEvaluation
}
