import { a } from './cycle-a.js'

globalThis.deferEvents.push('loads-cycle')

export function loadCycle() {
  return import('./cycle-a.js')
}

// Nothing uses this export, so the import of `cycle-a.js` is removed.
export function unused() {
  return a()
}
