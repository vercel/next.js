import { a } from './cycle-a.js'

const b = 'b'

export function getB() {
  return a === 'a' ? b : 'invalid'
}
