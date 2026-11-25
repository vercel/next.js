// A re-export followed by a top-level body statement. ESM evaluates the
// dependency before the body, so a registration emitted *after* the body would
// be wrong. The a/b/c fixture cannot catch this, as it has no body statement.
export { a } from './a'
import { order } from './order'

order.push('body')
