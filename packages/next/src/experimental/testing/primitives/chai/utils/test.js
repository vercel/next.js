/*!
 * Chai - test utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

import { flag } from './flag.js'

export function test(obj, args) {
  let negate = flag(obj, 'negate'),
    expr = args[0]
  return negate ? !expr : expr
}
