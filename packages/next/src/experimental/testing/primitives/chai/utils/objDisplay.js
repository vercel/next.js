/*!
 * Chai - flag utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

import { inspect } from './inspect.js'
import { config } from '../config.js'

export function objDisplay(obj) {
  let str = inspect(obj),
    type = Object.prototype.toString.call(obj)

  if (config.truncateThreshold && str.length >= config.truncateThreshold) {
    if (type === '[object Function]') {
      const objAsFunction = /** @type {Function} */ (obj)
      return !objAsFunction.name || objAsFunction.name === ''
        ? '[Function]'
        : '[Function: ' + objAsFunction.name + ']'
    } else if (type === '[object Array]') {
      const objAsArray = /** @type {unknown[]} */ (obj)
      return '[ Array(' + objAsArray.length + ') ]'
    } else if (type === '[object Object]') {
      const objAsObject = /** @type {Record<PropertyKey, unknown>} */ (obj)
      let keys = Object.keys(objAsObject),
        kstr =
          keys.length > 2
            ? keys.splice(0, 2).join(', ') + ', ...'
            : keys.join(', ')
      return '{ Object (' + kstr + ') }'
    } else {
      return str
    }
  } else {
    return str
  }
}
