// Baseline for lib/esm-deferred.js: the tree is evaluated when this module is
// loaded.
import * as tree from '../esm-eager/index.js'

export function execute() {
  return tree.default + 1
}
