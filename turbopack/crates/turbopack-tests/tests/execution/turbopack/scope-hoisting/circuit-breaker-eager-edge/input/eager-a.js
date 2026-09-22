import { eagerB, readEntry } from './eager-b.js'

export { readEntry }
export const eagerA = 'a'
export function readB() {
  return eagerB
}
