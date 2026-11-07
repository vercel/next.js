import { deferred, value } from './library/deferred.js'
import { eager } from './library/read-at-evaluation.js'
import { effect } from './effect.js'

// Read while this module is evaluated: imported eagerly.
console.log(eager)

// Only read inside functions. `deferred.js` has no side effects, so it is evaluated by the first
// call. `effect.js` has side effects and is evaluated before this module.
export function run() {
  return [deferred(), value, effect()]
}
