import { value } from './pure-dep.js'

import('./evaluation-effect.js')
require('./evaluation-require-effect.cjs')
void (/*#__PURE__*/ (() => import('./evaluation-effect.js'))())
void (
  /*#__PURE__*/ ((callback) => callback)(() => import('./evaluation-effect.js'))
)

class EvaluationContexts {
  static field = import('./evaluation-effect.js')

  static {
    require('./evaluation-require-effect.cjs')
  }
}

export const derived = value + 1
export { EvaluationContexts }
