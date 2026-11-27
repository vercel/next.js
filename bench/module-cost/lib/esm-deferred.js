// The tree is loaded with this module, but only evaluated on first access in
// `execute()`.
import defer * as tree from '../esm-deferred/index.js'

export function execute() {
  return tree.default + 1
}
