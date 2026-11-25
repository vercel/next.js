// The tree is loaded with this module, but never evaluated as it's not accessed
// by `execute()`.
import defer * as tree from '../esm-deferred-unused/index.js'

export function execute() {
  return 1
}

// Not called, keeps the deferred import alive.
export function unused() {
  return tree.default
}
