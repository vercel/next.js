/*!
 * Chai - expectTypes utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

import { AssertionError } from '../internal/assertion-error/index.js'
import { flag } from './flag.js'
import { type } from './type-detect.js'

export function expectTypes(obj, types) {
  let flagMsg = flag(obj, 'message')
  let ssfi = /** @type {Function} */ (flag(obj, 'ssfi'))

  flagMsg = flagMsg ? flagMsg + ': ' : ''

  obj = /** @type {object} */ (flag(obj, 'object'))
  types = types.map(function (t) {
    return t.toLowerCase()
  })
  types.sort()

  // Transforms ['lorem', 'ipsum'] into 'a lorem, or an ipsum'
  let str = types
    .map(function (t, index) {
      let art = ~['a', 'e', 'i', 'o', 'u'].indexOf(t.charAt(0)) ? 'an' : 'a'
      let or = types.length > 1 && index === types.length - 1 ? 'or ' : ''
      return or + art + ' ' + t
    })
    .join(', ')

  let objType = type(obj).toLowerCase()

  if (
    !types.some(function (expected) {
      return objType === expected
    })
  ) {
    throw new AssertionError(
      flagMsg + 'object tested must be ' + str + ', but ' + objType + ' given',
      undefined,
      ssfi
    )
  }
}
