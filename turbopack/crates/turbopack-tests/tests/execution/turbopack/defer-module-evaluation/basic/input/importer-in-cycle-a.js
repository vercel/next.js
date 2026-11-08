import { b } from './importer-in-cycle-b.js'
import { value } from './library/imported-from-cycle.js'

globalThis.deferEvents.push('importer-in-cycle-a')

export function readFromCycle() {
  return b() ? value : undefined
}
