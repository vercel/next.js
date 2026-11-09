import { a } from './cycle-a.js'

globalThis.deferEvents.push('cycle-b')

export function b() {
  return typeof a === 'function' ? 'b' : 'missing'
}
