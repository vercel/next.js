// The shape that must not be reordered: a re-export, then a plain import of a
// *different* module, then another re-export. Merging both re-exports into one
// registration call would evaluate './c' before './b'.
export { a } from './a'
import { b } from './b'
export { c } from './c'

console.log(b)
