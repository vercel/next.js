import { belowCycle } from './imports-cycle.js'

globalThis.deferEvents.push('above-imports-cycle')

export function aboveCycle() {
  return belowCycle
}
