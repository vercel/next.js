/*!
 * chai
 * Copyright(c) 2011-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

import { Assertion as BaseAssertion } from '../assertion.js'
import { flag as baseFlag, inspect } from '../utils/index.js'
import { AssertionError } from '../internal/assertion-error/index.js'

export function createChaiAssertInterface(Assertion, flag) {
  function assert(express, errmsg) {
    let test = new Assertion(null, null, assert, true)
    test.assert(express, errmsg, '[ negation message unavailable ]')
  }

  assert.fail = function (actual, expected, message, operator) {
    if (arguments.length < 2) {
      // Comply with Node's fail([message]) interface

      message = actual
      actual = undefined
    }

    message = message || 'assert.fail()'
    throw new AssertionError(
      message,
      {
        actual: actual,
        expected: expected,
        operator: operator,
      },
      assert.fail
    )
  }

  assert.isOk = function (val, msg) {
    void new Assertion(val, msg, assert.isOk, true).is.ok
  }

  assert.isNotOk = function (val, msg) {
    void new Assertion(val, msg, assert.isNotOk, true).is.not.ok
  }

  assert.equal = function (act, exp, msg) {
    let test = new Assertion(act, msg, assert.equal, true)

    test.assert(
      // eslint-disable-next-line eqeqeq -- assert.equal deliberately uses abstract equality.
      exp == flag(test, 'object'),
      'expected #{this} to equal #{exp}',
      'expected #{this} to not equal #{act}',
      exp,
      act,
      true
    )
  }

  assert.notEqual = function (act, exp, msg) {
    let test = new Assertion(act, msg, assert.notEqual, true)

    test.assert(
      // eslint-disable-next-line eqeqeq -- assert.notEqual deliberately uses abstract inequality.
      exp != flag(test, 'object'),
      'expected #{this} to not equal #{exp}',
      'expected #{this} to equal #{act}',
      exp,
      act,
      true
    )
  }

  assert.strictEqual = function (act, exp, msg) {
    new Assertion(act, msg, assert.strictEqual, true).to.equal(exp)
  }

  assert.notStrictEqual = function (act, exp, msg) {
    new Assertion(act, msg, assert.notStrictEqual, true).to.not.equal(exp)
  }

  assert.deepEqual = assert.deepStrictEqual = function (act, exp, msg) {
    new Assertion(act, msg, assert.deepEqual, true).to.eql(exp)
  }

  assert.notDeepEqual = function (act, exp, msg) {
    new Assertion(act, msg, assert.notDeepEqual, true).to.not.eql(exp)
  }

  assert.isAbove = function (val, abv, msg) {
    new Assertion(val, msg, assert.isAbove, true).to.be.above(abv)
  }

  assert.isAtLeast = function (val, atlst, msg) {
    new Assertion(val, msg, assert.isAtLeast, true).to.be.least(atlst)
  }

  assert.isBelow = function (val, blw, msg) {
    new Assertion(val, msg, assert.isBelow, true).to.be.below(blw)
  }

  assert.isAtMost = function (val, atmst, msg) {
    new Assertion(val, msg, assert.isAtMost, true).to.be.most(atmst)
  }

  assert.isTrue = function (val, msg) {
    void new Assertion(val, msg, assert.isTrue, true).is['true']
  }

  assert.isNotTrue = function (val, msg) {
    new Assertion(val, msg, assert.isNotTrue, true).to.not.equal(true)
  }

  assert.isFalse = function (val, msg) {
    void new Assertion(val, msg, assert.isFalse, true).is['false']
  }

  assert.isNotFalse = function (val, msg) {
    new Assertion(val, msg, assert.isNotFalse, true).to.not.equal(false)
  }

  assert.isNull = function (val, msg) {
    new Assertion(val, msg, assert.isNull, true).to.equal(null)
  }

  assert.isNotNull = function (val, msg) {
    new Assertion(val, msg, assert.isNotNull, true).to.not.equal(null)
  }

  assert.isNaN = function (val, msg) {
    void new Assertion(val, msg, assert.isNaN, true).to.be.NaN
  }

  assert.isNotNaN = function (value, message) {
    void new Assertion(value, message, assert.isNotNaN, true).not.to.be.NaN
  }

  assert.exists = function (val, msg) {
    void new Assertion(val, msg, assert.exists, true).to.exist
  }

  assert.notExists = function (val, msg) {
    void new Assertion(val, msg, assert.notExists, true).to.not.exist
  }

  assert.isUndefined = function (val, msg) {
    new Assertion(val, msg, assert.isUndefined, true).to.equal(undefined)
  }

  assert.isDefined = function (val, msg) {
    new Assertion(val, msg, assert.isDefined, true).to.not.equal(undefined)
  }

  assert.isCallable = function (value, message) {
    void new Assertion(value, message, assert.isCallable, true).is.callable
  }

  assert.isNotCallable = function (value, message) {
    void new Assertion(value, message, assert.isNotCallable, true).is.not
      .callable
  }

  assert.isObject = function (val, msg) {
    new Assertion(val, msg, assert.isObject, true).to.be.a('object')
  }

  assert.isNotObject = function (val, msg) {
    new Assertion(val, msg, assert.isNotObject, true).to.not.be.a('object')
  }

  assert.isArray = function (val, msg) {
    new Assertion(val, msg, assert.isArray, true).to.be.an('array')
  }

  assert.isNotArray = function (val, msg) {
    new Assertion(val, msg, assert.isNotArray, true).to.not.be.an('array')
  }

  assert.isString = function (val, msg) {
    new Assertion(val, msg, assert.isString, true).to.be.a('string')
  }

  assert.isNotString = function (val, msg) {
    new Assertion(val, msg, assert.isNotString, true).to.not.be.a('string')
  }

  assert.isNumber = function (val, msg) {
    new Assertion(val, msg, assert.isNumber, true).to.be.a('number')
  }

  assert.isNotNumber = function (val, msg) {
    new Assertion(val, msg, assert.isNotNumber, true).to.not.be.a('number')
  }

  assert.isNumeric = function (val, msg) {
    void new Assertion(val, msg, assert.isNumeric, true).is.numeric
  }

  assert.isNotNumeric = function (val, msg) {
    void new Assertion(val, msg, assert.isNotNumeric, true).is.not.numeric
  }

  assert.isFinite = function (val, msg) {
    void new Assertion(val, msg, assert.isFinite, true).to.be.finite
  }

  assert.isBoolean = function (val, msg) {
    new Assertion(val, msg, assert.isBoolean, true).to.be.a('boolean')
  }

  assert.isNotBoolean = function (val, msg) {
    new Assertion(val, msg, assert.isNotBoolean, true).to.not.be.a('boolean')
  }

  assert.typeOf = function (val, type, msg) {
    new Assertion(val, msg, assert.typeOf, true).to.be.a(type)
  }

  assert.notTypeOf = function (value, type, message) {
    new Assertion(value, message, assert.notTypeOf, true).to.not.be.a(type)
  }

  assert.instanceOf = function (val, type, msg) {
    new Assertion(val, msg, assert.instanceOf, true).to.be.instanceOf(type)
  }

  assert.notInstanceOf = function (val, type, msg) {
    new Assertion(val, msg, assert.notInstanceOf, true).to.not.be.instanceOf(
      type
    )
  }

  assert.include = function (exp, inc, msg) {
    new Assertion(exp, msg, assert.include, true).include(inc)
  }

  assert.notInclude = function (exp, inc, msg) {
    new Assertion(exp, msg, assert.notInclude, true).not.include(inc)
  }

  assert.deepInclude = function (exp, inc, msg) {
    new Assertion(exp, msg, assert.deepInclude, true).deep.include(inc)
  }

  assert.notDeepInclude = function (exp, inc, msg) {
    new Assertion(exp, msg, assert.notDeepInclude, true).not.deep.include(inc)
  }

  assert.nestedInclude = function (exp, inc, msg) {
    new Assertion(exp, msg, assert.nestedInclude, true).nested.include(inc)
  }

  assert.notNestedInclude = function (exp, inc, msg) {
    new Assertion(exp, msg, assert.notNestedInclude, true).not.nested.include(
      inc
    )
  }

  assert.deepNestedInclude = function (exp, inc, msg) {
    new Assertion(exp, msg, assert.deepNestedInclude, true).deep.nested.include(
      inc
    )
  }

  assert.notDeepNestedInclude = function (exp, inc, msg) {
    new Assertion(
      exp,
      msg,
      assert.notDeepNestedInclude,
      true
    ).not.deep.nested.include(inc)
  }

  assert.ownInclude = function (exp, inc, msg) {
    new Assertion(exp, msg, assert.ownInclude, true).own.include(inc)
  }

  assert.notOwnInclude = function (exp, inc, msg) {
    new Assertion(exp, msg, assert.notOwnInclude, true).not.own.include(inc)
  }

  assert.deepOwnInclude = function (exp, inc, msg) {
    new Assertion(exp, msg, assert.deepOwnInclude, true).deep.own.include(inc)
  }

  assert.notDeepOwnInclude = function (exp, inc, msg) {
    new Assertion(
      exp,
      msg,
      assert.notDeepOwnInclude,
      true
    ).not.deep.own.include(inc)
  }

  assert.match = function (exp, re, msg) {
    new Assertion(exp, msg, assert.match, true).to.match(re)
  }

  assert.notMatch = function (exp, re, msg) {
    new Assertion(exp, msg, assert.notMatch, true).to.not.match(re)
  }

  assert.property = function (obj, prop, msg) {
    new Assertion(obj, msg, assert.property, true).to.have.property(prop)
  }

  assert.notProperty = function (obj, prop, msg) {
    new Assertion(obj, msg, assert.notProperty, true).to.not.have.property(prop)
  }

  assert.propertyVal = function (obj, prop, val, msg) {
    new Assertion(obj, msg, assert.propertyVal, true).to.have.property(
      prop,
      val
    )
  }

  assert.notPropertyVal = function (obj, prop, val, msg) {
    new Assertion(obj, msg, assert.notPropertyVal, true).to.not.have.property(
      prop,
      val
    )
  }

  assert.deepPropertyVal = function (obj, prop, val, msg) {
    new Assertion(obj, msg, assert.deepPropertyVal, true).to.have.deep.property(
      prop,
      val
    )
  }

  assert.notDeepPropertyVal = function (obj, prop, val, msg) {
    new Assertion(
      obj,
      msg,
      assert.notDeepPropertyVal,
      true
    ).to.not.have.deep.property(prop, val)
  }

  assert.ownProperty = function (obj, prop, msg) {
    new Assertion(obj, msg, assert.ownProperty, true).to.have.own.property(prop)
  }

  assert.notOwnProperty = function (obj, prop, msg) {
    new Assertion(
      obj,
      msg,
      assert.notOwnProperty,
      true
    ).to.not.have.own.property(prop)
  }

  assert.ownPropertyVal = function (obj, prop, value, msg) {
    new Assertion(obj, msg, assert.ownPropertyVal, true).to.have.own.property(
      prop,
      value
    )
  }

  assert.notOwnPropertyVal = function (obj, prop, value, msg) {
    new Assertion(
      obj,
      msg,
      assert.notOwnPropertyVal,
      true
    ).to.not.have.own.property(prop, value)
  }

  assert.deepOwnPropertyVal = function (obj, prop, value, msg) {
    new Assertion(
      obj,
      msg,
      assert.deepOwnPropertyVal,
      true
    ).to.have.deep.own.property(prop, value)
  }

  assert.notDeepOwnPropertyVal = function (obj, prop, value, msg) {
    new Assertion(
      obj,
      msg,
      assert.notDeepOwnPropertyVal,
      true
    ).to.not.have.deep.own.property(prop, value)
  }

  assert.nestedProperty = function (obj, prop, msg) {
    new Assertion(
      obj,
      msg,
      assert.nestedProperty,
      true
    ).to.have.nested.property(prop)
  }

  assert.notNestedProperty = function (obj, prop, msg) {
    new Assertion(
      obj,
      msg,
      assert.notNestedProperty,
      true
    ).to.not.have.nested.property(prop)
  }

  assert.nestedPropertyVal = function (obj, prop, val, msg) {
    new Assertion(
      obj,
      msg,
      assert.nestedPropertyVal,
      true
    ).to.have.nested.property(prop, val)
  }

  assert.notNestedPropertyVal = function (obj, prop, val, msg) {
    new Assertion(
      obj,
      msg,
      assert.notNestedPropertyVal,
      true
    ).to.not.have.nested.property(prop, val)
  }

  assert.deepNestedPropertyVal = function (obj, prop, val, msg) {
    new Assertion(
      obj,
      msg,
      assert.deepNestedPropertyVal,
      true
    ).to.have.deep.nested.property(prop, val)
  }

  assert.notDeepNestedPropertyVal = function (obj, prop, val, msg) {
    new Assertion(
      obj,
      msg,
      assert.notDeepNestedPropertyVal,
      true
    ).to.not.have.deep.nested.property(prop, val)
  }

  assert.lengthOf = function (exp, len, msg) {
    new Assertion(exp, msg, assert.lengthOf, true).to.have.lengthOf(len)
  }

  assert.hasAnyKeys = function (obj, keys, msg) {
    new Assertion(obj, msg, assert.hasAnyKeys, true).to.have.any.keys(keys)
  }

  assert.hasAllKeys = function (obj, keys, msg) {
    new Assertion(obj, msg, assert.hasAllKeys, true).to.have.all.keys(keys)
  }

  assert.containsAllKeys = function (obj, keys, msg) {
    new Assertion(obj, msg, assert.containsAllKeys, true).to.contain.all.keys(
      keys
    )
  }

  assert.doesNotHaveAnyKeys = function (obj, keys, msg) {
    new Assertion(
      obj,
      msg,
      assert.doesNotHaveAnyKeys,
      true
    ).to.not.have.any.keys(keys)
  }

  assert.doesNotHaveAllKeys = function (obj, keys, msg) {
    new Assertion(
      obj,
      msg,
      assert.doesNotHaveAllKeys,
      true
    ).to.not.have.all.keys(keys)
  }

  assert.hasAnyDeepKeys = function (obj, keys, msg) {
    new Assertion(obj, msg, assert.hasAnyDeepKeys, true).to.have.any.deep.keys(
      keys
    )
  }

  assert.hasAllDeepKeys = function (obj, keys, msg) {
    new Assertion(obj, msg, assert.hasAllDeepKeys, true).to.have.all.deep.keys(
      keys
    )
  }

  assert.containsAllDeepKeys = function (obj, keys, msg) {
    new Assertion(
      obj,
      msg,
      assert.containsAllDeepKeys,
      true
    ).to.contain.all.deep.keys(keys)
  }

  assert.doesNotHaveAnyDeepKeys = function (obj, keys, msg) {
    new Assertion(
      obj,
      msg,
      assert.doesNotHaveAnyDeepKeys,
      true
    ).to.not.have.any.deep.keys(keys)
  }

  assert.doesNotHaveAllDeepKeys = function (obj, keys, msg) {
    new Assertion(
      obj,
      msg,
      assert.doesNotHaveAllDeepKeys,
      true
    ).to.not.have.all.deep.keys(keys)
  }

  assert.throws = function (fn, errorLike, errMsgMatcher, msg) {
    if ('string' === typeof errorLike || errorLike instanceof RegExp) {
      errMsgMatcher = errorLike
      errorLike = null
    }

    let assertErr = new Assertion(fn, msg, assert.throws, true).to.throw(
      errorLike,
      errMsgMatcher
    )
    return flag(assertErr, 'object')
  }

  assert.doesNotThrow = function (fn, errorLike, errMsgMatcher, message) {
    if ('string' === typeof errorLike || errorLike instanceof RegExp) {
      errMsgMatcher = errorLike
      errorLike = null
    }

    new Assertion(fn, message, assert.doesNotThrow, true).to.not.throw(
      errorLike,
      errMsgMatcher
    )
  }

  assert.operator = function (val, operator, val2, msg) {
    let ok
    switch (operator) {
      case '==':
        // eslint-disable-next-line eqeqeq -- Evaluate the operator requested by the caller.
        ok = val == val2
        break
      case '===':
        ok = val === val2
        break
      case '>':
        ok = val > val2
        break
      case '>=':
        ok = val >= val2
        break
      case '<':
        ok = val < val2
        break
      case '<=':
        ok = val <= val2
        break
      case '!=':
        // eslint-disable-next-line eqeqeq -- Evaluate the operator requested by the caller.
        ok = val != val2
        break
      case '!==':
        ok = val !== val2
        break
      default:
        msg = msg ? msg + ': ' : msg
        throw new AssertionError(
          msg + 'Invalid operator "' + operator + '"',
          undefined,
          assert.operator
        )
    }
    let test = new Assertion(ok, msg, assert.operator, true)
    test.assert(
      true === flag(test, 'object'),
      'expected ' + inspect(val) + ' to be ' + operator + ' ' + inspect(val2),
      'expected ' +
        inspect(val) +
        ' to not be ' +
        operator +
        ' ' +
        inspect(val2)
    )
  }

  assert.closeTo = function (act, exp, delta, msg) {
    new Assertion(act, msg, assert.closeTo, true).to.be.closeTo(exp, delta)
  }

  assert.approximately = function (act, exp, delta, msg) {
    new Assertion(act, msg, assert.approximately, true).to.be.approximately(
      exp,
      delta
    )
  }

  assert.sameMembers = function (set1, set2, msg) {
    new Assertion(set1, msg, assert.sameMembers, true).to.have.same.members(
      set2
    )
  }

  assert.notSameMembers = function (set1, set2, msg) {
    new Assertion(
      set1,
      msg,
      assert.notSameMembers,
      true
    ).to.not.have.same.members(set2)
  }

  assert.sameDeepMembers = function (set1, set2, msg) {
    new Assertion(
      set1,
      msg,
      assert.sameDeepMembers,
      true
    ).to.have.same.deep.members(set2)
  }

  assert.notSameDeepMembers = function (set1, set2, msg) {
    new Assertion(
      set1,
      msg,
      assert.notSameDeepMembers,
      true
    ).to.not.have.same.deep.members(set2)
  }

  assert.sameOrderedMembers = function (set1, set2, msg) {
    new Assertion(
      set1,
      msg,
      assert.sameOrderedMembers,
      true
    ).to.have.same.ordered.members(set2)
  }

  assert.notSameOrderedMembers = function (set1, set2, msg) {
    new Assertion(
      set1,
      msg,
      assert.notSameOrderedMembers,
      true
    ).to.not.have.same.ordered.members(set2)
  }

  assert.sameDeepOrderedMembers = function (set1, set2, msg) {
    new Assertion(
      set1,
      msg,
      assert.sameDeepOrderedMembers,
      true
    ).to.have.same.deep.ordered.members(set2)
  }

  assert.notSameDeepOrderedMembers = function (set1, set2, msg) {
    new Assertion(
      set1,
      msg,
      assert.notSameDeepOrderedMembers,
      true
    ).to.not.have.same.deep.ordered.members(set2)
  }

  assert.includeMembers = function (superset, subset, msg) {
    new Assertion(
      superset,
      msg,
      assert.includeMembers,
      true
    ).to.include.members(subset)
  }

  assert.notIncludeMembers = function (superset, subset, msg) {
    new Assertion(
      superset,
      msg,
      assert.notIncludeMembers,
      true
    ).to.not.include.members(subset)
  }

  assert.includeDeepMembers = function (superset, subset, msg) {
    new Assertion(
      superset,
      msg,
      assert.includeDeepMembers,
      true
    ).to.include.deep.members(subset)
  }

  assert.notIncludeDeepMembers = function (superset, subset, msg) {
    new Assertion(
      superset,
      msg,
      assert.notIncludeDeepMembers,
      true
    ).to.not.include.deep.members(subset)
  }

  assert.includeOrderedMembers = function (superset, subset, msg) {
    new Assertion(
      superset,
      msg,
      assert.includeOrderedMembers,
      true
    ).to.include.ordered.members(subset)
  }

  assert.notIncludeOrderedMembers = function (superset, subset, msg) {
    new Assertion(
      superset,
      msg,
      assert.notIncludeOrderedMembers,
      true
    ).to.not.include.ordered.members(subset)
  }

  assert.includeDeepOrderedMembers = function (superset, subset, msg) {
    new Assertion(
      superset,
      msg,
      assert.includeDeepOrderedMembers,
      true
    ).to.include.deep.ordered.members(subset)
  }

  assert.notIncludeDeepOrderedMembers = function (superset, subset, msg) {
    new Assertion(
      superset,
      msg,
      assert.notIncludeDeepOrderedMembers,
      true
    ).to.not.include.deep.ordered.members(subset)
  }

  assert.oneOf = function (inList, list, msg) {
    new Assertion(inList, msg, assert.oneOf, true).to.be.oneOf(list)
  }

  assert.isIterable = function (obj, msg) {
    if (obj == null || typeof obj[Symbol.iterator] !== 'function') {
      msg = msg
        ? `${msg} expected ${inspect(obj)} to be an iterable`
        : `expected ${inspect(obj)} to be an iterable`

      throw new AssertionError(msg, undefined, assert.isIterable)
    }
  }

  assert.changes = function (fn, obj, prop, msg) {
    if (arguments.length === 3 && typeof obj === 'function') {
      msg = prop
      prop = null
    }

    new Assertion(fn, msg, assert.changes, true).to.change(obj, prop)
  }

  assert.changesBy = function (fn, obj, prop, delta, msg) {
    if (arguments.length === 4 && typeof obj === 'function') {
      let tmpMsg = delta
      delta = prop
      msg = tmpMsg
    } else if (arguments.length === 3) {
      delta = prop
      prop = null
    }

    new Assertion(fn, msg, assert.changesBy, true).to
      .change(obj, prop)
      .by(delta)
  }

  assert.doesNotChange = function (fn, obj, prop, msg) {
    if (arguments.length === 3 && typeof obj === 'function') {
      msg = prop
      prop = null
    }

    return new Assertion(fn, msg, assert.doesNotChange, true).to.not.change(
      obj,
      prop
    )
  }

  assert.changesButNotBy = function (fn, obj, prop, delta, msg) {
    if (arguments.length === 4 && typeof obj === 'function') {
      let tmpMsg = delta
      delta = prop
      msg = tmpMsg
    } else if (arguments.length === 3) {
      delta = prop
      prop = null
    }

    new Assertion(fn, msg, assert.changesButNotBy, true).to
      .change(obj, prop)
      .but.not.by(delta)
  }

  assert.increases = function (fn, obj, prop, msg) {
    if (arguments.length === 3 && typeof obj === 'function') {
      msg = prop
      prop = null
    }

    return new Assertion(fn, msg, assert.increases, true).to.increase(obj, prop)
  }

  assert.increasesBy = function (fn, obj, prop, delta, msg) {
    if (arguments.length === 4 && typeof obj === 'function') {
      let tmpMsg = delta
      delta = prop
      msg = tmpMsg
    } else if (arguments.length === 3) {
      delta = prop
      prop = null
    }

    new Assertion(fn, msg, assert.increasesBy, true).to
      .increase(obj, prop)
      .by(delta)
  }

  assert.doesNotIncrease = function (fn, obj, prop, msg) {
    if (arguments.length === 3 && typeof obj === 'function') {
      msg = prop
      prop = null
    }

    return new Assertion(fn, msg, assert.doesNotIncrease, true).to.not.increase(
      obj,
      prop
    )
  }

  assert.increasesButNotBy = function (fn, obj, prop, delta, msg) {
    if (arguments.length === 4 && typeof obj === 'function') {
      let tmpMsg = delta
      delta = prop
      msg = tmpMsg
    } else if (arguments.length === 3) {
      delta = prop
      prop = null
    }

    new Assertion(fn, msg, assert.increasesButNotBy, true).to
      .increase(obj, prop)
      .but.not.by(delta)
  }

  assert.decreases = function (fn, obj, prop, msg) {
    if (arguments.length === 3 && typeof obj === 'function') {
      msg = prop
      prop = null
    }

    return new Assertion(fn, msg, assert.decreases, true).to.decrease(obj, prop)
  }

  assert.decreasesBy = function (fn, obj, prop, delta, msg) {
    if (arguments.length === 4 && typeof obj === 'function') {
      let tmpMsg = delta
      delta = prop
      msg = tmpMsg
    } else if (arguments.length === 3) {
      delta = prop
      prop = null
    }

    new Assertion(fn, msg, assert.decreasesBy, true).to
      .decrease(obj, prop)
      .by(delta)
  }

  assert.doesNotDecrease = function (fn, obj, prop, msg) {
    if (arguments.length === 3 && typeof obj === 'function') {
      msg = prop
      prop = null
    }

    return new Assertion(fn, msg, assert.doesNotDecrease, true).to.not.decrease(
      obj,
      prop
    )
  }

  assert.doesNotDecreaseBy = function (fn, obj, prop, delta, msg) {
    if (arguments.length === 4 && typeof obj === 'function') {
      let tmpMsg = delta
      delta = prop
      msg = tmpMsg
    } else if (arguments.length === 3) {
      delta = prop
      prop = null
    }

    return new Assertion(fn, msg, assert.doesNotDecreaseBy, true).to.not
      .decrease(obj, prop)
      .by(delta)
  }

  assert.decreasesButNotBy = function (fn, obj, prop, delta, msg) {
    if (arguments.length === 4 && typeof obj === 'function') {
      let tmpMsg = delta
      delta = prop
      msg = tmpMsg
    } else if (arguments.length === 3) {
      delta = prop
      prop = null
    }

    new Assertion(fn, msg, assert.decreasesButNotBy, true).to
      .decrease(obj, prop)
      .but.not.by(delta)
  }

  assert.ifError = function (val) {
    if (val) {
      throw val
    }
  }

  assert.isExtensible = function (obj, msg) {
    void new Assertion(obj, msg, assert.isExtensible, true).to.be.extensible
  }

  assert.isNotExtensible = function (obj, msg) {
    void new Assertion(obj, msg, assert.isNotExtensible, true).to.not.be
      .extensible
  }

  assert.isSealed = function (obj, msg) {
    void new Assertion(obj, msg, assert.isSealed, true).to.be.sealed
  }

  assert.isNotSealed = function (obj, msg) {
    void new Assertion(obj, msg, assert.isNotSealed, true).to.not.be.sealed
  }

  assert.isFrozen = function (obj, msg) {
    void new Assertion(obj, msg, assert.isFrozen, true).to.be.frozen
  }

  assert.isNotFrozen = function (obj, msg) {
    void new Assertion(obj, msg, assert.isNotFrozen, true).to.not.be.frozen
  }

  assert.isEmpty = function (val, msg) {
    void new Assertion(val, msg, assert.isEmpty, true).to.be.empty
  }

  assert.isNotEmpty = function (val, msg) {
    void new Assertion(val, msg, assert.isNotEmpty, true).to.not.be.empty
  }

  assert.containsSubset = function (val, exp, msg) {
    new Assertion(val, msg).to.containSubset(exp)
  }

  assert.doesNotContainSubset = function (val, exp, msg) {
    new Assertion(val, msg).to.not.containSubset(exp)
  }

  const aliases = [
    ['isOk', 'ok'],
    ['isNotOk', 'notOk'],
    ['throws', 'throw'],
    ['throws', 'Throw'],
    ['isExtensible', 'extensible'],
    ['isNotExtensible', 'notExtensible'],
    ['isSealed', 'sealed'],
    ['isNotSealed', 'notSealed'],
    ['isFrozen', 'frozen'],
    ['isNotFrozen', 'notFrozen'],
    ['isEmpty', 'empty'],
    ['isNotEmpty', 'notEmpty'],
    ['isCallable', 'isFunction'],
    ['isNotCallable', 'isNotFunction'],
    ['containsSubset', 'containSubset'],
  ]
  for (const [name, as] of aliases) {
    assert[as] = assert[name]
  }

  return assert
}

export const assert = createChaiAssertInterface(BaseAssertion, baseFlag)
