/*!
 * chai
 * Copyright(c) 2011-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

import { Assertion } from '../assertion.js'
import { AssertionError } from '../internal/assertion-error/index.js'

function expect(val, message) {
  return new Assertion(val, message)
}

export { expect }

expect.fail = function (actual, expected, message, operator) {
  let msg = message
  if (arguments.length < 2) {
    msg = /** @type {string | undefined} */ (actual)
    actual = undefined
  }

  throw new AssertionError(
    msg || 'expect.fail()',
    {
      actual: actual,
      expected: expected,
      operator: operator,
    },
    expect.fail
  )
}
