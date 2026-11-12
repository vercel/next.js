/*!
 * chai
 * http://chaijs.com
 * Copyright(c) 2011-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

import { config } from './config.js'
import {
  createAssertionIdentity,
  registerAssertionIdentity,
} from './assertion-identity.js'
import { AssertionError } from './internal/assertion-error/index.js'
import * as util from './utils/index.js'

export class Assertion {
  /** @type {{}} */
  __flags = {}

  constructor(obj, msg, ssfi, lockSsfi) {
    util.flag(this, 'ssfi', ssfi || Assertion)
    util.flag(this, 'lockSsfi', lockSsfi)
    util.flag(this, 'object', obj)
    util.flag(this, 'message', msg)
    util.flag(this, 'eql', config.deepEqual || util.eql)

    const identity = createAssertionIdentity()
    const assertion = util.proxify(this)
    registerAssertionIdentity(this, identity)
    registerAssertionIdentity(assertion, identity)
    return assertion
  }

  static get includeStack() {
    console.warn(
      'Assertion.includeStack is deprecated, use chai.config.includeStack instead.'
    )
    return config.includeStack
  }

  static set includeStack(value) {
    console.warn(
      'Assertion.includeStack is deprecated, use chai.config.includeStack instead.'
    )
    config.includeStack = value
  }

  static get showDiff() {
    console.warn(
      'Assertion.showDiff is deprecated, use chai.config.showDiff instead.'
    )
    return config.showDiff
  }

  static set showDiff(value) {
    console.warn(
      'Assertion.showDiff is deprecated, use chai.config.showDiff instead.'
    )
    config.showDiff = value
  }

  static addProperty(name, fn) {
    util.addProperty(this.prototype, name, fn)
  }

  static addMethod(name, fn) {
    util.addMethod(this.prototype, name, fn)
  }

  static addChainableMethod(name, fn, chainingBehavior) {
    util.addChainableMethod(this.prototype, name, fn, chainingBehavior)
  }

  static overwriteProperty(name, fn) {
    util.overwriteProperty(this.prototype, name, fn)
  }

  static overwriteMethod(name, fn) {
    util.overwriteMethod(this.prototype, name, fn)
  }

  static overwriteChainableMethod(name, fn, chainingBehavior) {
    util.overwriteChainableMethod(this.prototype, name, fn, chainingBehavior)
  }

  assert(_expr, msg, _negateMsg, expected, _actual, showDiff) {
    const ok = util.test(this, arguments)
    if (false !== showDiff) showDiff = true
    if (undefined === expected && undefined === _actual) showDiff = false
    if (true !== config.showDiff) showDiff = false

    if (!ok) {
      msg = util.getMessage(this, arguments)
      const actual = util.getActual(this, arguments)
      /** @type {Record<PropertyKey, unknown>} */
      const assertionErrorObjectProperties = {
        actual: actual,
        expected: expected,
        showDiff: showDiff,
      }

      const operator = util.getOperator(this, arguments)
      if (operator) {
        assertionErrorObjectProperties.operator = operator
      }

      throw new AssertionError(
        msg,
        assertionErrorObjectProperties,
        config.includeStack ? this.assert : util.flag(this, 'ssfi')
      )
    }
  }

  get _obj() {
    return util.flag(this, 'object')
  }

  set _obj(val) {
    util.flag(this, 'object', val)
  }
}
