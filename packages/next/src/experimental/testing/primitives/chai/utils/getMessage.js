/*!
 * Chai - message composition utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

import { flag } from './flag.js'
import { getActual } from './getActual.js'
import { objDisplay } from './objDisplay.js'

/**
 * @typedef {import('../assertion.js').Assertion} Assertion
 */

export function getMessage(obj, args) {
  let negate = flag(obj, 'negate')
  let val = flag(obj, 'object')
  let expected = args[3]
  let actual = getActual(obj, args)
  let rawMsg = negate ? args[2] : args[1]
  let flagMsg = flag(obj, 'message')

  if (typeof rawMsg === 'function') rawMsg = rawMsg()
  const template = /** @type {string} */ (rawMsg) || ''
  const msg = template.replace(/#\{(this|act|exp)\}/g, function (_, tag) {
    if (tag === 'this') {
      return objDisplay(val)
    }
    if (tag === 'act') {
      return objDisplay(actual)
    }
    return objDisplay(expected)
  })

  return flagMsg ? flagMsg + ': ' + msg : msg
}
