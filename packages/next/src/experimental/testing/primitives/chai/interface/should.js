/*!
 * chai
 * Copyright(c) 2011-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

import { Assertion as BaseAssertion } from '../assertion.js'
import { AssertionError } from '../internal/assertion-error/index.js'

export function createChaiShouldInterface(Assertion) {
  function loadShould() {
    // explicitly define this method as function as to have it's name to include as `ssfi`

    function shouldGetter() {
      if (
        this instanceof String ||
        this instanceof Number ||
        this instanceof Boolean ||
        (typeof Symbol === 'function' && this instanceof Symbol) ||
        (typeof BigInt === 'function' && this instanceof BigInt)
      ) {
        return new Assertion(this.valueOf(), null, shouldGetter)
      }
      return new Assertion(this, null, shouldGetter)
    }

    function shouldSetter(value) {
      // See https://github.com/chaijs/chai/issues/86: this makes
      // `whatever.should = someValue` actually set `someValue`, which is
      // especially useful for `global.should = require('chai').should()`.
      //
      // Note that we have to use [[DefineProperty]] instead of [[Put]]
      // since otherwise we would trigger this very setter!
      Object.defineProperty(this, 'should', {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
    // modify Object.prototype to have `should`
    // eslint-disable-next-line no-extend-native -- The should interface installs this accessor by contract.
    Object.defineProperty(Object.prototype, 'should', {
      set: shouldSetter,
      get: shouldGetter,
      configurable: true,
    })

    let should = {}

    should.fail = function (actual, expected, message, operator) {
      if (arguments.length < 2) {
        message = actual
        actual = undefined
      }

      message = message || 'should.fail()'
      throw new AssertionError(
        message,
        {
          actual: actual,
          expected: expected,
          operator: operator,
        },
        should.fail
      )
    }

    should.equal = function (actual, expected, message) {
      new Assertion(actual, message).to.equal(expected)
    }

    should.Throw = function (fn, errt, errs, msg) {
      new Assertion(fn, msg).to.Throw(errt, errs)
    }

    should.exist = function (val, msg) {
      void new Assertion(val, msg).to.exist
    }

    // negation
    should.not = {}

    should.not.equal = function (actual, expected, msg) {
      new Assertion(actual, msg).to.not.equal(expected)
    }

    should.not.Throw = function (fn, errt, errs, msg) {
      new Assertion(fn, msg).to.not.Throw(errt, errs)
    }

    should.not.exist = function (val, msg) {
      void new Assertion(val, msg).to.not.exist
    }

    should['throw'] = should['Throw']
    should.not['throw'] = should.not['Throw']

    return should
  }

  return loadShould
}

export const should = createChaiShouldInterface(BaseAssertion)
export const Should = should
