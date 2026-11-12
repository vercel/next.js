/*!
 * Chai - getOwnEnumerableProperties utility
 * Copyright(c) 2011-2016 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

import { getOwnEnumerablePropertySymbols } from './getOwnEnumerablePropertySymbols.js'

export function getOwnEnumerableProperties(obj) {
  return /** @type {PropertyKey[]} */ (Object.keys(obj)).concat(
    getOwnEnumerablePropertySymbols(obj)
  )
}
