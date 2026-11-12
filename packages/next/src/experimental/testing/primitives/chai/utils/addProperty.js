/*!
 * Chai - addProperty utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

import { Assertion } from '../assertion.js'
import { PluginEvent, events } from './events.js'
import { flag } from './flag.js'
import { isProxyEnabled } from './isProxyEnabled.js'
import { transferFlags } from './transferFlags.js'

export function addProperty(ctx, name, getter) {
  getter = getter === undefined ? function () {} : getter

  Object.defineProperty(ctx, name, {
    get: function propertyGetter() {
      // Setting the `ssfi` flag to `propertyGetter` causes this function to
      // be the starting point for removing implementation frames from the
      // stack trace of a failed assertion.
      //
      // However, we only want to use this function as the starting point if
      // the `lockSsfi` flag isn't set and proxy protection is disabled.
      //
      // If the `lockSsfi` flag is set, then either this assertion has been
      // overwritten by another assertion, or this assertion is being invoked
      // from inside of another assertion. In the first case, the `ssfi` flag
      // has already been set by the overwriting assertion. In the second
      // case, the `ssfi` flag has already been set by the outer assertion.
      //
      // If proxy protection is enabled, then the `ssfi` flag has already been
      // set by the proxy getter.
      if (!isProxyEnabled() && !flag(this, 'lockSsfi')) {
        flag(this, 'ssfi', propertyGetter)
      }

      let result = getter.call(this)
      if (result !== undefined) return result

      let newAssertion = new Assertion()
      transferFlags(this, newAssertion)
      return newAssertion
    },
    configurable: true,
  })

  events.dispatchEvent(new PluginEvent('addProperty', name, getter))
}
