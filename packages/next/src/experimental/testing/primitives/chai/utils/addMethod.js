/*!
 * Chai - addMethod utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

import { addLengthGuard } from './addLengthGuard.js'
import { PluginEvent, events } from './events.js'
import { flag } from './flag.js'
import { proxify } from './proxify.js'
import { transferFlags } from './transferFlags.js'
import { Assertion } from '../assertion.js'

export function addMethod(ctx, name, method) {
  let methodWrapper = function () {
    // Setting the `ssfi` flag to `methodWrapper` causes this function to be the
    // starting point for removing implementation frames from the stack trace of
    // a failed assertion.
    //
    // However, we only want to use this function as the starting point if the
    // `lockSsfi` flag isn't set.
    //
    // If the `lockSsfi` flag is set, then either this assertion has been
    // overwritten by another assertion, or this assertion is being invoked from
    // inside of another assertion. In the first case, the `ssfi` flag has
    // already been set by the overwriting assertion. In the second case, the
    // `ssfi` flag has already been set by the outer assertion.
    if (!flag(this, 'lockSsfi')) {
      flag(this, 'ssfi', methodWrapper)
    }

    let result = method.apply(this, arguments)
    if (result !== undefined) return result

    let newAssertion = new Assertion()
    transferFlags(this, newAssertion)
    return newAssertion
  }

  addLengthGuard(methodWrapper, name, false)
  /** @type {Record<PropertyKey, unknown>} */
  ctx[name] = proxify(methodWrapper, name)

  events.dispatchEvent(new PluginEvent('addMethod', name, method))
}
