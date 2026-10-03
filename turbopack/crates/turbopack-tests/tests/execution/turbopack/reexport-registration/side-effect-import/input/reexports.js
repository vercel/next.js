// A side-effect-only import contributes no imported symbols, so it is not a
// re-export source. The compact form may still forward `a`, but both imports
// must stay in source order so the side effect isn't lost or reordered.
export { a } from './a'
import './effect'
