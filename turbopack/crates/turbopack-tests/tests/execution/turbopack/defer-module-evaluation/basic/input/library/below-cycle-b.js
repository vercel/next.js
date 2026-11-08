import { a } from './below-cycle-a.js'

globalThis.deferEvents.push('below-cycle-b')

export function b() {
  return typeof a === 'function' ? 'b' : 'missing'
}
