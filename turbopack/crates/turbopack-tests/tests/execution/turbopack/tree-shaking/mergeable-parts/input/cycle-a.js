import { getB } from './cycle-b.js'

export const a = 'a'

export function readCycle() {
  return a + getB()
}
