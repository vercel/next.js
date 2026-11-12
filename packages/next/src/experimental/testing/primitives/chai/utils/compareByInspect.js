/*!
 * Chai - compareByInspect utility
 * Copyright(c) 2011-2016 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

import { inspect } from './inspect.js'

export function compareByInspect(a, b) {
  return inspect(a) < inspect(b) ? -1 : 1
}
