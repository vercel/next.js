/*!
 * Chai - transferFlags utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

import {
  markAssertionTaskTransfer,
  recordAssertionTransfer,
} from '../assertion-identity.js'

export function transferFlags(source, object, includeAll) {
  const sourceWithFlags =
    /** @type {{__flags?: Record<PropertyKey, unknown>}} */ (source)
  const objWithFlags = /** @type {{__flags?: Record<PropertyKey, unknown>}} */ (
    object
  )
  let flags =
    sourceWithFlags.__flags || (sourceWithFlags.__flags = Object.create(null))
  const objFlags =
    objWithFlags.__flags || (objWithFlags.__flags = Object.create(null))

  includeAll = arguments.length === 3 ? includeAll : true

  for (let flag in flags) {
    if (
      includeAll ||
      (flag !== 'object' &&
        flag !== 'ssfi' &&
        flag !== 'lockSsfi' &&
        flag !== 'message')
    ) {
      objFlags[flag] = flags[flag]
      if (flag === 'vitest-test') markAssertionTaskTransfer(object)
    }
  }
  recordAssertionTransfer(source, object)
}
