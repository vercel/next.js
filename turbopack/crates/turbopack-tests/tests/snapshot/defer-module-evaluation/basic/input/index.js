import { deferred, value } from './library/deferred.js'
import { eager } from './library/read-at-evaluation.js'
import { effect } from './effect.js'
import { atEvaluation, inFunction } from './library/mixed-eager-first.js'
import {
  inFunctionFirst,
  atEvaluationSecond,
} from './library/mixed-deferrable-first.js'
import * as whole from './library/whole-namespace.js'

// Read while this module is evaluated: imported eagerly.
console.log(eager)

// Only read inside functions. `deferred.js` has no side effects, so it is evaluated by the first
// call. `effect.js` has side effects and is evaluated before this module.
export function run() {
  return [deferred(), value, effect()]
}

// One import of each of these two modules is read while this module is evaluated. That evaluates
// the module, so the import that is only read inside a function is not deferred either, and the
// modules stay merged.
console.log(atEvaluation, atEvaluationSecond)

export function mixed() {
  return [inFunction, inFunctionFirst]
}

// The namespace object itself is used, not a named export: imported eagerly.
export function namespace() {
  return Object.keys(whole)
}
