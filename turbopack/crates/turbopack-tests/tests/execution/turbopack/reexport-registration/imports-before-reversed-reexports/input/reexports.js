// The side-effect imports establish a,b evaluation order. The later re-export
// declarations list the same sources in reverse order and must not reorder them.
import './a'
import './b'
export { b } from './b'
export { a } from './a'
