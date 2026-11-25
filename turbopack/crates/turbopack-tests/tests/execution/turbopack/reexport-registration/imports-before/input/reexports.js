// Mode 3: a plain import, but it *precedes* every re-export. Nothing that must
// run earlier comes after, so the re-export imports can be hoisted into one
// a.S call and suppressed without reordering.
import { first } from './first'

export { a } from './a'
export { b } from './b'

console.log(first)
