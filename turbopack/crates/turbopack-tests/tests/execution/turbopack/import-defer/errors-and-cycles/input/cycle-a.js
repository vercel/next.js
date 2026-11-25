// prettier-ignore
import defer * as b from './cycle-b.js'

export const name = 'a'

export function readFromCycle() {
  return b.value()
}
