import { value } from './library/free.js'

// This module has no side effect, so an import of it that uses no export is removed, and the
// module with it.
export function helper() {
  return value.atEvaluation
}
