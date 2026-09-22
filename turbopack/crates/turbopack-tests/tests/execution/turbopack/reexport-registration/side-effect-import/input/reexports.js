// A side-effect-only import contributes no imported symbols, so it is not a
// re-export source. It must disqualify this module from the compact form --
// otherwise the import would be dropped and its side effect lost.
export { a } from './a'
import './effect'
