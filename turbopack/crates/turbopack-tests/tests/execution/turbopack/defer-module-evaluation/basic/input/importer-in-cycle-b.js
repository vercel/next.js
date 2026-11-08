import { readFromCycle } from './importer-in-cycle-a.js'

export function b() {
  return typeof readFromCycle === 'function'
}
