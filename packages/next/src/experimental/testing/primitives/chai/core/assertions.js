/*!
 * chai
 * http://chaijs.com
 * Copyright(c) 2011-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

import { Assertion } from '../assertion.js'
import { AssertionError } from '../internal/assertion-error/index.js'
import * as _ from '../utils/index.js'
import { config } from '../config.js'

const { flag } = _

;[
  'to',
  'be',
  'been',
  'is',
  'and',
  'has',
  'have',
  'with',
  'that',
  'which',
  'at',
  'of',
  'same',
  'but',
  'does',
  'still',
  'also',
].forEach(function (chain) {
  Assertion.addProperty(chain)
})

Assertion.addProperty('not', function () {
  flag(this, 'negate', true)
})

Assertion.addProperty('deep', function () {
  flag(this, 'deep', true)
})

Assertion.addProperty('nested', function () {
  flag(this, 'nested', true)
})

Assertion.addProperty('own', function () {
  flag(this, 'own', true)
})

Assertion.addProperty('ordered', function () {
  flag(this, 'ordered', true)
})

Assertion.addProperty('any', function () {
  flag(this, 'any', true)
  flag(this, 'all', false)
})

Assertion.addProperty('all', function () {
  flag(this, 'all', true)
  flag(this, 'any', false)
})

const functionTypes = {
  function: [
    'function',
    'asyncfunction',
    'generatorfunction',
    'asyncgeneratorfunction',
  ],
  asyncfunction: ['asyncfunction', 'asyncgeneratorfunction'],
  generatorfunction: ['generatorfunction', 'asyncgeneratorfunction'],
  asyncgeneratorfunction: ['asyncgeneratorfunction'],
}

function an(type, msg) {
  if (msg) flag(this, 'message', msg)
  type = type.toLowerCase()
  let obj = flag(this, 'object'),
    article = ~['a', 'e', 'i', 'o', 'u'].indexOf(type.charAt(0)) ? 'an ' : 'a '

  const detectedType = _.type(obj).toLowerCase()

  if (functionTypes['function'].includes(type)) {
    this.assert(
      functionTypes[type].includes(detectedType),
      'expected #{this} to be ' + article + type,
      'expected #{this} not to be ' + article + type
    )
  } else {
    this.assert(
      type === detectedType,
      'expected #{this} to be ' + article + type,
      'expected #{this} not to be ' + article + type
    )
  }
}

Assertion.addChainableMethod('an', an)
Assertion.addChainableMethod('a', an)

function SameValueZero(a, b) {
  return (_.isNaN(a) && _.isNaN(b)) || a === b
}

function includeChainingBehavior() {
  flag(this, 'contains', true)
}

function include(val, msg) {
  if (msg) flag(this, 'message', msg)

  let obj = flag(this, 'object'),
    objType = _.type(obj).toLowerCase(),
    flagMsg = flag(this, 'message'),
    negate = flag(this, 'negate'),
    ssfi = flag(this, 'ssfi'),
    isDeep = flag(this, 'deep'),
    descriptor = isDeep ? 'deep ' : '',
    isEql = isDeep ? flag(this, 'eql') : SameValueZero

  flagMsg = flagMsg ? flagMsg + ': ' : ''

  let included = false

  switch (objType) {
    case 'string':
      included = obj.indexOf(val) !== -1
      break

    case 'weakset':
      if (isDeep) {
        throw new AssertionError(
          flagMsg + 'unable to use .deep.include with WeakSet',
          undefined,
          ssfi
        )
      }

      included = obj.has(val)
      break

    case 'map':
      obj.forEach(function (item) {
        included = included || isEql(item, val)
      })
      break

    case 'set':
      if (isDeep) {
        obj.forEach(function (item) {
          included = included || isEql(item, val)
        })
      } else {
        included = obj.has(val)
      }
      break

    case 'array':
      if (isDeep) {
        included = obj.some(function (item) {
          return isEql(item, val)
        })
      } else {
        included = obj.indexOf(val) !== -1
      }
      break

    default: {
      // This block is for asserting a subset of properties in an object.
      // `_.expectTypes` isn't used here because `.include` should work with
      // objects with a custom `@@toStringTag`.
      if (val !== Object(val)) {
        throw new AssertionError(
          flagMsg +
            'the given combination of arguments (' +
            objType +
            ' and ' +
            _.type(val).toLowerCase() +
            ')' +
            ' is invalid for this assertion. ' +
            'You can use an array, a map, an object, a set, a string, ' +
            'or a weakset instead of a ' +
            _.type(val).toLowerCase(),
          undefined,
          ssfi
        )
      }

      let props = Object.keys(val)
      let firstErr = null
      let numErrs = 0

      props.forEach(function (prop) {
        let propAssertion = new Assertion(obj)
        _.transferFlags(this, propAssertion, true)
        flag(propAssertion, 'lockSsfi', true)

        if (!negate || props.length === 1) {
          propAssertion.property(prop, val[prop])
          return
        }

        try {
          propAssertion.property(prop, val[prop])
        } catch (err) {
          if (!_.checkError.compatibleConstructor(err, AssertionError)) {
            throw err
          }
          if (firstErr === null) firstErr = err
          numErrs++
        }
      }, this)

      // When validating .not.include with multiple properties, we only want
      // to throw an assertion error if all of the properties are included,
      // in which case we throw the first property assertion error that we
      // encountered.
      if (negate && props.length > 1 && numErrs === props.length) {
        throw firstErr
      }
      return
    }
  }

  // Assert inclusion in collection or substring in a string.
  this.assert(
    included,
    'expected #{this} to ' + descriptor + 'include ' + _.inspect(val),
    'expected #{this} to not ' + descriptor + 'include ' + _.inspect(val)
  )
}

Assertion.addChainableMethod('include', include, includeChainingBehavior)
Assertion.addChainableMethod('contain', include, includeChainingBehavior)
Assertion.addChainableMethod('contains', include, includeChainingBehavior)
Assertion.addChainableMethod('includes', include, includeChainingBehavior)

Assertion.addProperty('ok', function () {
  this.assert(
    flag(this, 'object'),
    'expected #{this} to be truthy',
    'expected #{this} to be falsy'
  )
})

Assertion.addProperty('true', function () {
  this.assert(
    true === flag(this, 'object'),
    'expected #{this} to be true',
    'expected #{this} to be false',
    flag(this, 'negate') ? false : true
  )
})

Assertion.addProperty('numeric', function () {
  const object = flag(this, 'object')

  this.assert(
    ['Number', 'BigInt'].includes(_.type(object)),
    'expected #{this} to be numeric',
    'expected #{this} to not be numeric',
    flag(this, 'negate') ? false : true
  )
})

Assertion.addProperty('callable', function () {
  const val = flag(this, 'object')
  const ssfi = flag(this, 'ssfi')
  const message = flag(this, 'message')
  const msg = message ? `${message}: ` : ''
  const negate = flag(this, 'negate')

  const assertionMessage = negate
    ? `${msg}expected ${_.inspect(val)} not to be a callable function`
    : `${msg}expected ${_.inspect(val)} to be a callable function`

  const isCallable = [
    'Function',
    'AsyncFunction',
    'GeneratorFunction',
    'AsyncGeneratorFunction',
  ].includes(_.type(val))

  if ((isCallable && negate) || (!isCallable && !negate)) {
    throw new AssertionError(assertionMessage, undefined, ssfi)
  }
})

Assertion.addProperty('false', function () {
  this.assert(
    false === flag(this, 'object'),
    'expected #{this} to be false',
    'expected #{this} to be true',
    flag(this, 'negate') ? true : false
  )
})

Assertion.addProperty('null', function () {
  this.assert(
    null === flag(this, 'object'),
    'expected #{this} to be null',
    'expected #{this} not to be null'
  )
})

Assertion.addProperty('undefined', function () {
  this.assert(
    undefined === flag(this, 'object'),
    'expected #{this} to be undefined',
    'expected #{this} not to be undefined'
  )
})

Assertion.addProperty('NaN', function () {
  this.assert(
    _.isNaN(flag(this, 'object')),
    'expected #{this} to be NaN',
    'expected #{this} not to be NaN'
  )
})

function assertExist() {
  let val = flag(this, 'object')
  this.assert(
    val !== null && val !== undefined,
    'expected #{this} to exist',
    'expected #{this} to not exist'
  )
}

Assertion.addProperty('exist', assertExist)
Assertion.addProperty('exists', assertExist)

Assertion.addProperty('empty', function () {
  let val = flag(this, 'object'),
    ssfi = flag(this, 'ssfi'),
    flagMsg = flag(this, 'message'),
    itemsCount

  flagMsg = flagMsg ? flagMsg + ': ' : ''

  switch (_.type(val).toLowerCase()) {
    case 'array':
    case 'string':
      itemsCount = val.length
      break
    case 'map':
    case 'set':
      itemsCount = val.size
      break
    case 'weakmap':
    case 'weakset':
      throw new AssertionError(
        flagMsg + '.empty was passed a weak collection',
        undefined,
        ssfi
      )
    case 'function': {
      const msg = flagMsg + '.empty was passed a function ' + _.getName(val)
      throw new AssertionError(msg.trim(), undefined, ssfi)
    }
    default:
      if (val !== Object(val)) {
        throw new AssertionError(
          flagMsg + '.empty was passed non-string primitive ' + _.inspect(val),
          undefined,
          ssfi
        )
      }
      itemsCount = Object.keys(val).length
  }

  this.assert(
    0 === itemsCount,
    'expected #{this} to be empty',
    'expected #{this} not to be empty'
  )
})

function checkArguments() {
  let obj = flag(this, 'object'),
    type = _.type(obj)
  this.assert(
    'Arguments' === type,
    'expected #{this} to be arguments but got ' + type,
    'expected #{this} to not be arguments'
  )
}

Assertion.addProperty('arguments', checkArguments)
Assertion.addProperty('Arguments', checkArguments)

function assertEqual(val, msg) {
  if (msg) flag(this, 'message', msg)
  let obj = flag(this, 'object')
  if (flag(this, 'deep')) {
    let prevLockSsfi = flag(this, 'lockSsfi')
    flag(this, 'lockSsfi', true)
    this.eql(val)
    flag(this, 'lockSsfi', prevLockSsfi)
  } else {
    this.assert(
      val === obj,
      'expected #{this} to equal #{exp}',
      'expected #{this} to not equal #{exp}',
      val,
      this._obj,
      true
    )
  }
}

Assertion.addMethod('equal', assertEqual)
Assertion.addMethod('equals', assertEqual)
Assertion.addMethod('eq', assertEqual)

function assertEql(obj, msg) {
  if (msg) flag(this, 'message', msg)
  let eql = flag(this, 'eql')
  this.assert(
    eql(obj, flag(this, 'object')),
    'expected #{this} to deeply equal #{exp}',
    'expected #{this} to not deeply equal #{exp}',
    obj,
    this._obj,
    true
  )
}

Assertion.addMethod('eql', assertEql)
Assertion.addMethod('eqls', assertEql)

function assertAbove(n, msg) {
  if (msg) flag(this, 'message', msg)
  let obj = flag(this, 'object'),
    doLength = flag(this, 'doLength'),
    flagMsg = flag(this, 'message'),
    msgPrefix = flagMsg ? flagMsg + ': ' : '',
    ssfi = flag(this, 'ssfi'),
    objType = _.type(obj).toLowerCase(),
    nType = _.type(n).toLowerCase()

  if (doLength && objType !== 'map' && objType !== 'set') {
    new Assertion(obj, flagMsg, ssfi, true).to.have.property('length')
  }

  if (!doLength && objType === 'date' && nType !== 'date') {
    throw new AssertionError(
      msgPrefix + 'the argument to above must be a date',
      undefined,
      ssfi
    )
  } else if (!_.isNumeric(n) && (doLength || _.isNumeric(obj))) {
    throw new AssertionError(
      msgPrefix + 'the argument to above must be a number',
      undefined,
      ssfi
    )
  } else if (!doLength && objType !== 'date' && !_.isNumeric(obj)) {
    let printObj = objType === 'string' ? "'" + obj + "'" : obj
    throw new AssertionError(
      msgPrefix + 'expected ' + printObj + ' to be a number or a date',
      undefined,
      ssfi
    )
  }

  if (doLength) {
    let descriptor = 'length',
      itemsCount
    if (objType === 'map' || objType === 'set') {
      descriptor = 'size'
      itemsCount = obj.size
    } else {
      itemsCount = obj.length
    }
    this.assert(
      itemsCount > n,
      'expected #{this} to have a ' +
        descriptor +
        ' above #{exp} but got #{act}',
      'expected #{this} to not have a ' + descriptor + ' above #{exp}',
      n,
      itemsCount
    )
  } else {
    this.assert(
      obj > n,
      'expected #{this} to be above #{exp}',
      'expected #{this} to be at most #{exp}',
      n
    )
  }
}

Assertion.addMethod('above', assertAbove)
Assertion.addMethod('gt', assertAbove)
Assertion.addMethod('greaterThan', assertAbove)

function assertLeast(n, msg) {
  if (msg) flag(this, 'message', msg)
  let obj = flag(this, 'object'),
    doLength = flag(this, 'doLength'),
    flagMsg = flag(this, 'message'),
    msgPrefix = flagMsg ? flagMsg + ': ' : '',
    ssfi = flag(this, 'ssfi'),
    objType = _.type(obj).toLowerCase(),
    nType = _.type(n).toLowerCase(),
    errorMessage,
    shouldThrow = true

  if (doLength && objType !== 'map' && objType !== 'set') {
    new Assertion(obj, flagMsg, ssfi, true).to.have.property('length')
  }

  if (!doLength && objType === 'date' && nType !== 'date') {
    errorMessage = msgPrefix + 'the argument to least must be a date'
  } else if (!_.isNumeric(n) && (doLength || _.isNumeric(obj))) {
    errorMessage = msgPrefix + 'the argument to least must be a number'
  } else if (!doLength && objType !== 'date' && !_.isNumeric(obj)) {
    let printObj = objType === 'string' ? "'" + obj + "'" : obj
    errorMessage =
      msgPrefix + 'expected ' + printObj + ' to be a number or a date'
  } else {
    shouldThrow = false
  }

  if (shouldThrow) {
    throw new AssertionError(errorMessage, undefined, ssfi)
  }

  if (doLength) {
    let descriptor = 'length',
      itemsCount
    if (objType === 'map' || objType === 'set') {
      descriptor = 'size'
      itemsCount = obj.size
    } else {
      itemsCount = obj.length
    }
    this.assert(
      itemsCount >= n,
      'expected #{this} to have a ' +
        descriptor +
        ' at least #{exp} but got #{act}',
      'expected #{this} to have a ' + descriptor + ' below #{exp}',
      n,
      itemsCount
    )
  } else {
    this.assert(
      obj >= n,
      'expected #{this} to be at least #{exp}',
      'expected #{this} to be below #{exp}',
      n
    )
  }
}

Assertion.addMethod('least', assertLeast)
Assertion.addMethod('gte', assertLeast)
Assertion.addMethod('greaterThanOrEqual', assertLeast)

function assertBelow(n, msg) {
  if (msg) flag(this, 'message', msg)
  let obj = flag(this, 'object'),
    doLength = flag(this, 'doLength'),
    flagMsg = flag(this, 'message'),
    msgPrefix = flagMsg ? flagMsg + ': ' : '',
    ssfi = flag(this, 'ssfi'),
    objType = _.type(obj).toLowerCase(),
    nType = _.type(n).toLowerCase(),
    errorMessage,
    shouldThrow = true

  if (doLength && objType !== 'map' && objType !== 'set') {
    new Assertion(obj, flagMsg, ssfi, true).to.have.property('length')
  }

  if (!doLength && objType === 'date' && nType !== 'date') {
    errorMessage = msgPrefix + 'the argument to below must be a date'
  } else if (!_.isNumeric(n) && (doLength || _.isNumeric(obj))) {
    errorMessage = msgPrefix + 'the argument to below must be a number'
  } else if (!doLength && objType !== 'date' && !_.isNumeric(obj)) {
    let printObj = objType === 'string' ? "'" + obj + "'" : obj
    errorMessage =
      msgPrefix + 'expected ' + printObj + ' to be a number or a date'
  } else {
    shouldThrow = false
  }

  if (shouldThrow) {
    throw new AssertionError(errorMessage, undefined, ssfi)
  }

  if (doLength) {
    let descriptor = 'length',
      itemsCount
    if (objType === 'map' || objType === 'set') {
      descriptor = 'size'
      itemsCount = obj.size
    } else {
      itemsCount = obj.length
    }
    this.assert(
      itemsCount < n,
      'expected #{this} to have a ' +
        descriptor +
        ' below #{exp} but got #{act}',
      'expected #{this} to not have a ' + descriptor + ' below #{exp}',
      n,
      itemsCount
    )
  } else {
    this.assert(
      obj < n,
      'expected #{this} to be below #{exp}',
      'expected #{this} to be at least #{exp}',
      n
    )
  }
}

Assertion.addMethod('below', assertBelow)
Assertion.addMethod('lt', assertBelow)
Assertion.addMethod('lessThan', assertBelow)

function assertMost(n, msg) {
  if (msg) flag(this, 'message', msg)
  let obj = flag(this, 'object'),
    doLength = flag(this, 'doLength'),
    flagMsg = flag(this, 'message'),
    msgPrefix = flagMsg ? flagMsg + ': ' : '',
    ssfi = flag(this, 'ssfi'),
    objType = _.type(obj).toLowerCase(),
    nType = _.type(n).toLowerCase(),
    errorMessage,
    shouldThrow = true

  if (doLength && objType !== 'map' && objType !== 'set') {
    new Assertion(obj, flagMsg, ssfi, true).to.have.property('length')
  }

  if (!doLength && objType === 'date' && nType !== 'date') {
    errorMessage = msgPrefix + 'the argument to most must be a date'
  } else if (!_.isNumeric(n) && (doLength || _.isNumeric(obj))) {
    errorMessage = msgPrefix + 'the argument to most must be a number'
  } else if (!doLength && objType !== 'date' && !_.isNumeric(obj)) {
    let printObj = objType === 'string' ? "'" + obj + "'" : obj
    errorMessage =
      msgPrefix + 'expected ' + printObj + ' to be a number or a date'
  } else {
    shouldThrow = false
  }

  if (shouldThrow) {
    throw new AssertionError(errorMessage, undefined, ssfi)
  }

  if (doLength) {
    let descriptor = 'length',
      itemsCount
    if (objType === 'map' || objType === 'set') {
      descriptor = 'size'
      itemsCount = obj.size
    } else {
      itemsCount = obj.length
    }
    this.assert(
      itemsCount <= n,
      'expected #{this} to have a ' +
        descriptor +
        ' at most #{exp} but got #{act}',
      'expected #{this} to have a ' + descriptor + ' above #{exp}',
      n,
      itemsCount
    )
  } else {
    this.assert(
      obj <= n,
      'expected #{this} to be at most #{exp}',
      'expected #{this} to be above #{exp}',
      n
    )
  }
}

Assertion.addMethod('most', assertMost)
Assertion.addMethod('lte', assertMost)
Assertion.addMethod('lessThanOrEqual', assertMost)

Assertion.addMethod('within', function (start, finish, msg) {
  if (msg) flag(this, 'message', msg)
  let obj = flag(this, 'object'),
    doLength = flag(this, 'doLength'),
    flagMsg = flag(this, 'message'),
    msgPrefix = flagMsg ? flagMsg + ': ' : '',
    ssfi = flag(this, 'ssfi'),
    objType = _.type(obj).toLowerCase(),
    startType = _.type(start).toLowerCase(),
    finishType = _.type(finish).toLowerCase(),
    errorMessage,
    shouldThrow = true,
    range =
      startType === 'date' && finishType === 'date'
        ? start.toISOString() + '..' + finish.toISOString()
        : start + '..' + finish

  if (doLength && objType !== 'map' && objType !== 'set') {
    new Assertion(obj, flagMsg, ssfi, true).to.have.property('length')
  }

  if (
    !doLength &&
    objType === 'date' &&
    (startType !== 'date' || finishType !== 'date')
  ) {
    errorMessage = msgPrefix + 'the arguments to within must be dates'
  } else if (
    (!_.isNumeric(start) || !_.isNumeric(finish)) &&
    (doLength || _.isNumeric(obj))
  ) {
    errorMessage = msgPrefix + 'the arguments to within must be numbers'
  } else if (!doLength && objType !== 'date' && !_.isNumeric(obj)) {
    let printObj = objType === 'string' ? "'" + obj + "'" : obj
    errorMessage =
      msgPrefix + 'expected ' + printObj + ' to be a number or a date'
  } else {
    shouldThrow = false
  }

  if (shouldThrow) {
    throw new AssertionError(errorMessage, undefined, ssfi)
  }

  if (doLength) {
    let descriptor = 'length',
      itemsCount
    if (objType === 'map' || objType === 'set') {
      descriptor = 'size'
      itemsCount = obj.size
    } else {
      itemsCount = obj.length
    }
    this.assert(
      itemsCount >= start && itemsCount <= finish,
      'expected #{this} to have a ' + descriptor + ' within ' + range,
      'expected #{this} to not have a ' + descriptor + ' within ' + range
    )
  } else {
    this.assert(
      obj >= start && obj <= finish,
      'expected #{this} to be within ' + range,
      'expected #{this} to not be within ' + range
    )
  }
})

function assertInstanceOf(constructor, msg) {
  if (msg) flag(this, 'message', msg)

  let target = flag(this, 'object')
  let ssfi = flag(this, 'ssfi')
  let flagMsg = flag(this, 'message')
  let isInstanceOf

  try {
    isInstanceOf = target instanceof constructor
  } catch (err) {
    if (err instanceof TypeError) {
      flagMsg = flagMsg ? flagMsg + ': ' : ''
      throw new AssertionError(
        flagMsg +
          'The instanceof assertion needs a constructor but ' +
          _.type(constructor) +
          ' was given.',
        undefined,
        ssfi
      )
    }
    throw err
  }

  let name = _.getName(constructor)
  if (name == null) {
    name = 'an unnamed constructor'
  }

  this.assert(
    isInstanceOf,
    'expected #{this} to be an instance of ' + name,
    'expected #{this} to not be an instance of ' + name
  )
}

Assertion.addMethod('instanceof', assertInstanceOf)
Assertion.addMethod('instanceOf', assertInstanceOf)

function assertProperty(name, val, msg) {
  if (msg) flag(this, 'message', msg)

  let isNested = flag(this, 'nested'),
    isOwn = flag(this, 'own'),
    flagMsg = flag(this, 'message'),
    obj = flag(this, 'object'),
    ssfi = flag(this, 'ssfi'),
    nameType = typeof name

  flagMsg = flagMsg ? flagMsg + ': ' : ''

  if (isNested) {
    if (nameType !== 'string') {
      throw new AssertionError(
        flagMsg +
          'the argument to property must be a string when using nested syntax',
        undefined,
        ssfi
      )
    }
  } else {
    if (
      nameType !== 'string' &&
      nameType !== 'number' &&
      nameType !== 'symbol'
    ) {
      throw new AssertionError(
        flagMsg +
          'the argument to property must be a string, number, or symbol',
        undefined,
        ssfi
      )
    }
  }

  if (isNested && isOwn) {
    throw new AssertionError(
      flagMsg + 'The "nested" and "own" flags cannot be combined.',
      undefined,
      ssfi
    )
  }

  if (obj === null || obj === undefined) {
    throw new AssertionError(
      flagMsg + 'Target cannot be null or undefined.',
      undefined,
      ssfi
    )
  }

  let isDeep = flag(this, 'deep'),
    negate = flag(this, 'negate'),
    pathInfo = isNested ? _.getPathInfo(obj, name) : null,
    value = isNested ? pathInfo.value : obj[name],
    isEql = isDeep ? flag(this, 'eql') : (val1, val2) => val1 === val2

  let descriptor = ''
  if (isDeep) descriptor += 'deep '
  if (isOwn) descriptor += 'own '
  if (isNested) descriptor += 'nested '
  descriptor += 'property '

  let hasProperty
  if (isOwn) hasProperty = Object.prototype.hasOwnProperty.call(obj, name)
  else if (isNested) hasProperty = pathInfo.exists
  else hasProperty = _.hasProperty(obj, name)

  // When performing a negated assertion for both name and val, merely having
  // a property with the given name isn't enough to cause the assertion to
  // fail. It must both have a property with the given name, and the value of
  // that property must equal the given val. Therefore, skip this assertion in
  // favor of the next.
  if (!negate || arguments.length === 1) {
    this.assert(
      hasProperty,
      'expected #{this} to have ' + descriptor + _.inspect(name),
      'expected #{this} to not have ' + descriptor + _.inspect(name)
    )
  }

  if (arguments.length > 1) {
    this.assert(
      hasProperty && isEql(val, value),
      'expected #{this} to have ' +
        descriptor +
        _.inspect(name) +
        ' of #{exp}, but got #{act}',
      'expected #{this} to not have ' +
        descriptor +
        _.inspect(name) +
        ' of #{act}',
      val,
      value
    )
  }

  flag(this, 'object', value)
}

Assertion.addMethod('property', assertProperty)

function assertOwnProperty(_name, _value, _msg) {
  flag(this, 'own', true)
  assertProperty.apply(this, arguments)
}

Assertion.addMethod('ownProperty', assertOwnProperty)
Assertion.addMethod('haveOwnProperty', assertOwnProperty)

function assertOwnPropertyDescriptor(name, descriptor, msg) {
  if (typeof descriptor === 'string') {
    msg = descriptor
    descriptor = null
  }
  if (msg) flag(this, 'message', msg)
  let obj = flag(this, 'object')
  let actualDescriptor = Object.getOwnPropertyDescriptor(Object(obj), name)
  let eql = flag(this, 'eql')
  if (actualDescriptor && descriptor) {
    this.assert(
      eql(descriptor, actualDescriptor),
      'expected the own property descriptor for ' +
        _.inspect(name) +
        ' on #{this} to match ' +
        _.inspect(descriptor) +
        ', got ' +
        _.inspect(actualDescriptor),
      'expected the own property descriptor for ' +
        _.inspect(name) +
        ' on #{this} to not match ' +
        _.inspect(descriptor),
      descriptor,
      actualDescriptor,
      true
    )
  } else {
    this.assert(
      actualDescriptor,
      'expected #{this} to have an own property descriptor for ' +
        _.inspect(name),
      'expected #{this} to not have an own property descriptor for ' +
        _.inspect(name)
    )
  }
  flag(this, 'object', actualDescriptor)
}

Assertion.addMethod('ownPropertyDescriptor', assertOwnPropertyDescriptor)
Assertion.addMethod('haveOwnPropertyDescriptor', assertOwnPropertyDescriptor)

function assertLengthChain() {
  flag(this, 'doLength', true)
}

function assertLength(n, msg) {
  if (msg) flag(this, 'message', msg)
  let obj = flag(this, 'object'),
    objType = _.type(obj).toLowerCase(),
    flagMsg = flag(this, 'message'),
    ssfi = flag(this, 'ssfi'),
    descriptor = 'length',
    itemsCount

  switch (objType) {
    case 'map':
    case 'set':
      descriptor = 'size'
      itemsCount = obj.size
      break
    default:
      new Assertion(obj, flagMsg, ssfi, true).to.have.property('length')
      itemsCount = obj.length
  }

  this.assert(
    // eslint-disable-next-line eqeqeq -- lengthOf uses JavaScript's abstract equality.
    itemsCount == n,
    'expected #{this} to have a ' + descriptor + ' of #{exp} but got #{act}',
    'expected #{this} to not have a ' + descriptor + ' of #{act}',
    n,
    itemsCount
  )
}

Assertion.addChainableMethod('length', assertLength, assertLengthChain)
Assertion.addChainableMethod('lengthOf', assertLength, assertLengthChain)

function assertMatch(re, msg) {
  if (msg) flag(this, 'message', msg)
  let obj = flag(this, 'object')
  this.assert(
    re.exec(obj),
    'expected #{this} to match ' + re,
    'expected #{this} not to match ' + re
  )
}

Assertion.addMethod('match', assertMatch)
Assertion.addMethod('matches', assertMatch)

Assertion.addMethod('string', function (str, msg) {
  if (msg) flag(this, 'message', msg)
  let obj = flag(this, 'object'),
    flagMsg = flag(this, 'message'),
    ssfi = flag(this, 'ssfi')
  new Assertion(obj, flagMsg, ssfi, true).is.a('string')

  this.assert(
    ~obj.indexOf(str),
    'expected #{this} to contain ' + _.inspect(str),
    'expected #{this} to not contain ' + _.inspect(str)
  )
})

function assertKeys(keys) {
  let obj = flag(this, 'object'),
    objType = _.type(obj),
    keysType = _.type(keys),
    ssfi = flag(this, 'ssfi'),
    isDeep = flag(this, 'deep'),
    str,
    deepStr = '',
    actual,
    ok = true,
    flagMsg = flag(this, 'message')

  flagMsg = flagMsg ? flagMsg + ': ' : ''
  let mixedArgsMsg =
    flagMsg +
    'when testing keys against an object or an array you must give a single Array|Object|String argument or multiple String arguments'

  if (objType === 'Map' || objType === 'Set') {
    deepStr = isDeep ? 'deeply ' : ''
    actual = []

    // Map and Set '.keys' aren't supported in IE 11. Therefore, use .forEach.
    obj.forEach(function (val, key) {
      actual.push(key)
    })

    if (keysType !== 'Array') {
      keys = Array.prototype.slice.call(arguments)
    }
  } else {
    actual = _.getOwnEnumerableProperties(obj)

    switch (keysType) {
      case 'Array':
        if (arguments.length > 1) {
          throw new AssertionError(mixedArgsMsg, undefined, ssfi)
        }
        break
      case 'Object':
        if (arguments.length > 1) {
          throw new AssertionError(mixedArgsMsg, undefined, ssfi)
        }
        keys = Object.keys(keys)
        break
      default:
        keys = Array.prototype.slice.call(arguments)
    }

    // Only stringify non-Symbols because Symbols would become "Symbol()"
    keys = keys.map(function (val) {
      return typeof val === 'symbol' ? val : String(val)
    })
  }

  if (!keys.length) {
    throw new AssertionError(flagMsg + 'keys required', undefined, ssfi)
  }

  let len = keys.length,
    any = flag(this, 'any'),
    all = flag(this, 'all'),
    expected = keys,
    isEql = isDeep ? flag(this, 'eql') : (val1, val2) => val1 === val2

  if (!any && !all) {
    all = true
  }

  const uniqueExpected = [...new Set(expected)]

  // Has any
  if (any) {
    ok = uniqueExpected.some(function (expectedKey) {
      return actual.some(function (actualKey) {
        return isEql(expectedKey, actualKey)
      })
    })
  }

  // Has all
  if (all) {
    ok = uniqueExpected.every(function (expectedKey) {
      return actual.some(function (actualKey) {
        return isEql(expectedKey, actualKey)
      })
    })

    if (!flag(this, 'contains')) {
      ok = ok && uniqueExpected.length === actual.length
    }
  }

  // Key string
  if (len > 1) {
    keys = keys.map(function (key) {
      return _.inspect(key)
    })
    let last = keys.pop()
    if (all) {
      str = keys.join(', ') + ', and ' + last
    }
    if (any) {
      str = keys.join(', ') + ', or ' + last
    }
  } else {
    str = _.inspect(keys[0])
  }

  // Form
  str = (len > 1 ? 'keys ' : 'key ') + str

  // Have / include
  str = (flag(this, 'contains') ? 'contain ' : 'have ') + str

  // Assertion
  this.assert(
    ok,
    'expected #{this} to ' + deepStr + str,
    'expected #{this} to not ' + deepStr + str,
    expected.slice(0).sort(_.compareByInspect),
    actual.sort(_.compareByInspect),
    true
  )
}

Assertion.addMethod('keys', assertKeys)
Assertion.addMethod('key', assertKeys)

function assertThrows(errorLike, errMsgMatcher, msg) {
  if (msg) flag(this, 'message', msg)
  let obj = flag(this, 'object'),
    ssfi = flag(this, 'ssfi'),
    flagMsg = flag(this, 'message'),
    negate = flag(this, 'negate') || false
  new Assertion(obj, flagMsg, ssfi, true).is.a('function')

  if (_.isRegExp(errorLike) || typeof errorLike === 'string') {
    errMsgMatcher = errorLike
    errorLike = null
  }

  let caughtErr
  let errorWasThrown = false
  try {
    obj()
  } catch (err) {
    errorWasThrown = true
    caughtErr = err
  }

  // If we have the negate flag enabled and at least one valid argument it means we do expect an error
  // but we want it to match a given set of criteria
  let everyArgIsUndefined =
    errorLike === undefined && errMsgMatcher === undefined

  // If we've got the negate flag enabled and both args, we should only fail if both aren't compatible
  // See Issue #551 and PR #683@GitHub
  let everyArgIsDefined = Boolean(errorLike && errMsgMatcher)
  let errorLikeFail = false
  let errMsgMatcherFail = false

  // Checking if error was thrown
  if (everyArgIsUndefined || (!everyArgIsUndefined && !negate)) {
    // We need this to display results correctly according to their types
    let errorLikeString = 'an error'
    if (errorLike instanceof Error) {
      errorLikeString = '#{exp}'
    } else if (errorLike) {
      errorLikeString = _.checkError.getConstructorName(errorLike)
    }

    let actual = caughtErr
    if (caughtErr instanceof Error) {
      actual = caughtErr.toString()
    } else if (typeof caughtErr === 'string') {
      actual = caughtErr
    } else if (
      caughtErr &&
      (typeof caughtErr === 'object' || typeof caughtErr === 'function')
    ) {
      try {
        actual = _.checkError.getConstructorName(caughtErr)
      } catch (_err) {
        // somehow wasn't a constructor, maybe we got a function thrown
        // or similar
      }
    }

    this.assert(
      errorWasThrown,
      'expected #{this} to throw ' + errorLikeString,
      'expected #{this} to not throw an error but #{act} was thrown',
      errorLike && errorLike.toString(),
      actual
    )
  }

  if (errorLike && caughtErr) {
    // We should compare instances only if `errorLike` is an instance of `Error`
    if (errorLike instanceof Error) {
      let isCompatibleInstance = _.checkError.compatibleInstance(
        caughtErr,
        errorLike
      )

      if (isCompatibleInstance === negate) {
        // These checks were created to ensure we won't fail too soon when we've got both args and a negate
        // See Issue #551 and PR #683@GitHub
        if (everyArgIsDefined && negate) {
          errorLikeFail = true
        } else {
          this.assert(
            negate,
            'expected #{this} to throw #{exp} but #{act} was thrown',
            'expected #{this} to not throw #{exp}' +
              (caughtErr && !negate ? ' but #{act} was thrown' : ''),
            errorLike.toString(),
            caughtErr.toString()
          )
        }
      }
    }

    let isCompatibleConstructor = _.checkError.compatibleConstructor(
      caughtErr,
      errorLike
    )
    if (isCompatibleConstructor === negate) {
      if (everyArgIsDefined && negate) {
        errorLikeFail = true
      } else {
        this.assert(
          negate,
          'expected #{this} to throw #{exp} but #{act} was thrown',
          'expected #{this} to not throw #{exp}' +
            (caughtErr ? ' but #{act} was thrown' : ''),
          errorLike instanceof Error
            ? errorLike.toString()
            : errorLike && _.checkError.getConstructorName(errorLike),
          caughtErr instanceof Error
            ? caughtErr.toString()
            : caughtErr && _.checkError.getConstructorName(caughtErr)
        )
      }
    }
  }

  if (caughtErr && errMsgMatcher !== undefined && errMsgMatcher !== null) {
    // Here we check compatible messages
    let placeholder = 'including'
    if (_.isRegExp(errMsgMatcher)) {
      placeholder = 'matching'
    }

    let isCompatibleMessage = _.checkError.compatibleMessage(
      caughtErr,
      errMsgMatcher
    )
    if (isCompatibleMessage === negate) {
      if (everyArgIsDefined && negate) {
        errMsgMatcherFail = true
      } else {
        this.assert(
          negate,
          'expected #{this} to throw error ' +
            placeholder +
            ' #{exp} but got #{act}',
          'expected #{this} to throw error not ' + placeholder + ' #{exp}',
          errMsgMatcher,
          _.checkError.getMessage(caughtErr)
        )
      }
    }
  }

  // If both assertions failed and both should've matched we throw an error
  if (errorLikeFail && errMsgMatcherFail) {
    this.assert(
      negate,
      'expected #{this} to throw #{exp} but #{act} was thrown',
      'expected #{this} to not throw #{exp}' +
        (caughtErr ? ' but #{act} was thrown' : ''),
      errorLike instanceof Error
        ? errorLike.toString()
        : errorLike && _.checkError.getConstructorName(errorLike),
      caughtErr instanceof Error
        ? caughtErr.toString()
        : caughtErr && _.checkError.getConstructorName(caughtErr)
    )
  }

  flag(this, 'object', caughtErr)
}

Assertion.addMethod('throw', assertThrows)
Assertion.addMethod('throws', assertThrows)
Assertion.addMethod('Throw', assertThrows)

function respondTo(method, msg) {
  if (msg) flag(this, 'message', msg)
  let obj = flag(this, 'object'),
    itself = flag(this, 'itself'),
    context =
      'function' === typeof obj && !itself ? obj.prototype[method] : obj[method]

  this.assert(
    'function' === typeof context,
    'expected #{this} to respond to ' + _.inspect(method),
    'expected #{this} to not respond to ' + _.inspect(method)
  )
}

Assertion.addMethod('respondTo', respondTo)
Assertion.addMethod('respondsTo', respondTo)

Assertion.addProperty('itself', function () {
  flag(this, 'itself', true)
})

function satisfy(matcher, msg) {
  if (msg) flag(this, 'message', msg)
  let obj = flag(this, 'object')
  let result = matcher(obj)
  this.assert(
    result,
    'expected #{this} to satisfy ' + _.objDisplay(matcher),
    'expected #{this} to not satisfy' + _.objDisplay(matcher),
    flag(this, 'negate') ? false : true,
    result
  )
}

Assertion.addMethod('satisfy', satisfy)
Assertion.addMethod('satisfies', satisfy)

function closeTo(expected, delta, msg) {
  if (msg) flag(this, 'message', msg)
  let obj = flag(this, 'object'),
    flagMsg = flag(this, 'message'),
    ssfi = flag(this, 'ssfi')

  void new Assertion(obj, flagMsg, ssfi, true).is.numeric
  let message = 'A `delta` value is required for `closeTo`'
  if (delta == null) {
    throw new AssertionError(
      flagMsg ? `${flagMsg}: ${message}` : message,
      undefined,
      ssfi
    )
  }
  void new Assertion(delta, flagMsg, ssfi, true).is.numeric
  message = 'A `expected` value is required for `closeTo`'
  if (expected == null) {
    throw new AssertionError(
      flagMsg ? `${flagMsg}: ${message}` : message,
      undefined,
      ssfi
    )
  }
  void new Assertion(expected, flagMsg, ssfi, true).is.numeric

  const abs = (x) => (x < 0 ? -x : x)

  // Used to round floating point number precision arithmetics
  // See: https://stackoverflow.com/a/3644302
  const strip = (number) => parseFloat(parseFloat(number).toPrecision(12))

  this.assert(
    strip(abs(obj - expected)) <= delta,
    'expected #{this} to be close to ' + expected + ' +/- ' + delta,
    'expected #{this} not to be close to ' + expected + ' +/- ' + delta
  )
}

Assertion.addMethod('closeTo', closeTo)
Assertion.addMethod('approximately', closeTo)

function isSubsetOf(_subset, _superset, cmp, contains, ordered) {
  let superset = Array.from(_superset)
  let subset = Array.from(_subset)
  if (!contains) {
    if (subset.length !== superset.length) return false
    superset = superset.slice()
  }

  return subset.every(function (elem, idx) {
    if (ordered) return cmp ? cmp(elem, superset[idx]) : elem === superset[idx]

    if (!cmp) {
      let matchIdx = superset.indexOf(elem)
      if (matchIdx === -1) return false

      // Remove match from superset so not counted twice if duplicate in subset.
      if (!contains) superset.splice(matchIdx, 1)
      return true
    }

    return superset.some(function (elem2, matchIdx) {
      if (!cmp(elem, elem2)) return false

      // Remove match from superset so not counted twice if duplicate in subset.
      if (!contains) superset.splice(matchIdx, 1)
      return true
    })
  })
}

Assertion.addMethod('members', function (subset, msg) {
  if (msg) flag(this, 'message', msg)
  let obj = flag(this, 'object'),
    flagMsg = flag(this, 'message'),
    ssfi = flag(this, 'ssfi')

  void new Assertion(obj, flagMsg, ssfi, true).to.be.iterable
  void new Assertion(subset, flagMsg, ssfi, true).to.be.iterable

  let contains = flag(this, 'contains')
  let ordered = flag(this, 'ordered')

  let subject, failMsg, failNegateMsg

  if (contains) {
    subject = ordered ? 'an ordered superset' : 'a superset'
    failMsg = 'expected #{this} to be ' + subject + ' of #{exp}'
    failNegateMsg = 'expected #{this} to not be ' + subject + ' of #{exp}'
  } else {
    subject = ordered ? 'ordered members' : 'members'
    failMsg = 'expected #{this} to have the same ' + subject + ' as #{exp}'
    failNegateMsg =
      'expected #{this} to not have the same ' + subject + ' as #{exp}'
  }

  let cmp = flag(this, 'deep') ? flag(this, 'eql') : undefined

  this.assert(
    isSubsetOf(subset, obj, cmp, contains, ordered),
    failMsg,
    failNegateMsg,
    subset,
    obj,
    true
  )
})

Assertion.addProperty('iterable', function (msg) {
  if (msg) flag(this, 'message', msg)
  let obj = flag(this, 'object')

  this.assert(
    obj != null && typeof obj[Symbol.iterator] === 'function',
    'expected #{this} to be an iterable',
    'expected #{this} to not be an iterable',
    obj
  )
})

function oneOf(list, msg) {
  if (msg) flag(this, 'message', msg)
  let expected = flag(this, 'object'),
    flagMsg = flag(this, 'message'),
    ssfi = flag(this, 'ssfi'),
    contains = flag(this, 'contains'),
    isDeep = flag(this, 'deep'),
    eql = flag(this, 'eql')
  new Assertion(list, flagMsg, ssfi, true).to.be.an('array')

  if (contains) {
    this.assert(
      list.some(function (possibility) {
        return (
          expected.indexOf(possibility) > -1 ||
          (isDeep &&
            Array.isArray(expected) &&
            expected.some(function (item) {
              return eql(item, possibility)
            }))
        )
      }),
      'expected #{this} to ' +
        (isDeep ? 'deeply ' : '') +
        'contain one of #{exp}',
      'expected #{this} to not ' +
        (isDeep ? 'deeply ' : '') +
        'contain one of #{exp}',
      list,
      expected
    )
  } else {
    if (isDeep) {
      this.assert(
        list.some(function (possibility) {
          return eql(expected, possibility)
        }),
        'expected #{this} to deeply equal one of #{exp}',
        'expected #{this} to not deeply equal one of #{exp}',
        list,
        expected
      )
    } else {
      this.assert(
        list.indexOf(expected) > -1,
        'expected #{this} to be one of #{exp}',
        'expected #{this} to not be one of #{exp}',
        list,
        expected
      )
    }
  }
}

Assertion.addMethod('oneOf', oneOf)

function assertChanges(subject, prop, msg) {
  if (msg) flag(this, 'message', msg)
  const fn = /** @type {() => void} */ (flag(this, 'object'))
  const flagMsg = flag(this, 'message')
  const ssfi = flag(this, 'ssfi')
  new Assertion(fn, flagMsg, ssfi, true).is.a('function')

  let initial
  if (prop === null || prop === undefined) {
    new Assertion(subject, flagMsg, ssfi, true).is.a('function')
    initial = /** @type {() => unknown} */ (subject)()
  } else {
    new Assertion(subject, flagMsg, ssfi, true).to.have.property(prop)
    initial = /** @type {Record<PropertyKey, unknown>} */ (subject)[prop]
  }

  fn()

  let final =
    prop === undefined || prop === null
      ? /** @type {() => unknown} */ (subject)()
      : /** @type {Record<PropertyKey, unknown>} */ (subject)[prop]
  let msgObj = prop === undefined || prop === null ? initial : '.' + prop

  // This gets flagged because of the .by(delta) assertion
  flag(this, 'deltaMsgObj', msgObj)
  flag(this, 'initialDeltaValue', initial)
  flag(this, 'finalDeltaValue', final)
  flag(this, 'deltaBehavior', 'change')
  flag(this, 'realDelta', final !== initial)

  this.assert(
    initial !== final,
    'expected ' + msgObj + ' to change',
    'expected ' + msgObj + ' to not change'
  )
}

Assertion.addMethod('change', assertChanges)
Assertion.addMethod('changes', assertChanges)

function assertIncreases(subject, prop, msg) {
  if (msg) flag(this, 'message', msg)
  const fn = /** @type {() => void} */ (flag(this, 'object'))
  const flagMsg = flag(this, 'message')
  const ssfi = flag(this, 'ssfi')
  new Assertion(fn, flagMsg, ssfi, true).is.a('function')

  let initial
  if (prop === null || prop === undefined) {
    new Assertion(subject, flagMsg, ssfi, true).is.a('function')
    initial = /** @type {() => number} */ (subject)()
  } else {
    new Assertion(subject, flagMsg, ssfi, true).to.have.property(prop)
    initial = /** @type {Record<PropertyKey, number>} */ (subject)[prop]
  }

  // Make sure that the target is a number
  new Assertion(initial, flagMsg, ssfi, true).is.a('number')

  fn()

  let final =
    prop === undefined || prop === null
      ? /** @type {() => number} */ (subject)()
      : /** @type {Record<PropertyKey, number>} */ (subject)[prop]
  let msgObj = prop === undefined || prop === null ? initial : '.' + prop

  flag(this, 'deltaMsgObj', msgObj)
  flag(this, 'initialDeltaValue', initial)
  flag(this, 'finalDeltaValue', final)
  flag(this, 'deltaBehavior', 'increase')
  flag(this, 'realDelta', final - initial)

  this.assert(
    final - initial > 0,
    'expected ' + msgObj + ' to increase',
    'expected ' + msgObj + ' to not increase'
  )
}

Assertion.addMethod('increase', assertIncreases)
Assertion.addMethod('increases', assertIncreases)

function assertDecreases(subject, prop, msg) {
  if (msg) flag(this, 'message', msg)
  const fn = /** @type {() => void} */ (flag(this, 'object'))
  const flagMsg = flag(this, 'message')
  const ssfi = flag(this, 'ssfi')
  new Assertion(fn, flagMsg, ssfi, true).is.a('function')

  let initial
  if (prop === null || prop === undefined) {
    new Assertion(subject, flagMsg, ssfi, true).is.a('function')
    initial = /** @type {() => number} */ (subject)()
  } else {
    new Assertion(subject, flagMsg, ssfi, true).to.have.property(prop)
    initial = /** @type {Record<PropertyKey, number>} */ (subject)[prop]
  }

  // Make sure that the target is a number
  new Assertion(initial, flagMsg, ssfi, true).is.a('number')

  fn()

  let final =
    prop === undefined || prop === null
      ? /** @type {() => number} */ (subject)()
      : /** @type {Record<PropertyKey, number>} */ (subject)[prop]
  let msgObj = prop === undefined || prop === null ? initial : '.' + prop

  flag(this, 'deltaMsgObj', msgObj)
  flag(this, 'initialDeltaValue', initial)
  flag(this, 'finalDeltaValue', final)
  flag(this, 'deltaBehavior', 'decrease')
  flag(this, 'realDelta', initial - final)

  this.assert(
    final - initial < 0,
    'expected ' + msgObj + ' to decrease',
    'expected ' + msgObj + ' to not decrease'
  )
}

Assertion.addMethod('decrease', assertDecreases)
Assertion.addMethod('decreases', assertDecreases)

function assertDelta(delta, msg) {
  if (msg) flag(this, 'message', msg)

  let msgObj = flag(this, 'deltaMsgObj')
  let initial = flag(this, 'initialDeltaValue')
  let final = flag(this, 'finalDeltaValue')
  let behavior = flag(this, 'deltaBehavior')
  let realDelta = flag(this, 'realDelta')

  let expression
  if (behavior === 'change') {
    expression = Math.abs(final - initial) === Math.abs(delta)
  } else {
    expression = realDelta === Math.abs(delta)
  }

  this.assert(
    expression,
    'expected ' + msgObj + ' to ' + behavior + ' by ' + delta,
    'expected ' + msgObj + ' to not ' + behavior + ' by ' + delta
  )
}

Assertion.addMethod('by', assertDelta)

Assertion.addProperty('extensible', function () {
  let obj = flag(this, 'object')

  // In ES5, if the argument to this method is a primitive, then it will cause a TypeError.
  // In ES6, a non-object argument will be treated as if it was a non-extensible ordinary object, simply return false.
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/isExtensible
  // The following provides ES6 behavior for ES5 environments.

  let isExtensible = obj === Object(obj) && Object.isExtensible(obj)

  this.assert(
    isExtensible,
    'expected #{this} to be extensible',
    'expected #{this} to not be extensible'
  )
})

Assertion.addProperty('sealed', function () {
  let obj = flag(this, 'object')

  // In ES5, if the argument to this method is a primitive, then it will cause a TypeError.
  // In ES6, a non-object argument will be treated as if it was a sealed ordinary object, simply return true.
  // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/isSealed
  // The following provides ES6 behavior for ES5 environments.

  let isSealed = obj === Object(obj) ? Object.isSealed(obj) : true

  this.assert(
    isSealed,
    'expected #{this} to be sealed',
    'expected #{this} to not be sealed'
  )
})

Assertion.addProperty('frozen', function () {
  let obj = flag(this, 'object')

  // In ES5, if the argument to this method is a primitive, then it will cause a TypeError.
  // In ES6, a non-object argument will be treated as if it was a frozen ordinary object, simply return true.
  // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/isFrozen
  // The following provides ES6 behavior for ES5 environments.

  let isFrozen = obj === Object(obj) ? Object.isFrozen(obj) : true

  this.assert(
    isFrozen,
    'expected #{this} to be frozen',
    'expected #{this} to not be frozen'
  )
})

Assertion.addProperty('finite', function (_msg) {
  let obj = flag(this, 'object')

  this.assert(
    typeof obj === 'number' && isFinite(obj),
    'expected #{this} to be a finite number',
    'expected #{this} to not be a finite number'
  )
})

function compareSubset(expected, actual) {
  if (expected === actual) {
    return true
  }
  if (typeof actual !== typeof expected) {
    return false
  }
  if (typeof expected !== 'object' || expected === null) {
    return expected === actual
  }
  if (!actual) {
    return false
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return false
    }
    return expected.every(function (exp) {
      return actual.some(function (act) {
        return compareSubset(exp, act)
      })
    })
  }

  if (expected instanceof Date) {
    if (actual instanceof Date) {
      return expected.getTime() === actual.getTime()
    } else {
      return false
    }
  }

  return Object.keys(expected).every(function (key) {
    let expectedValue = expected[key]
    let actualValue = actual[key]
    if (
      typeof expectedValue === 'object' &&
      expectedValue !== null &&
      actualValue !== null
    ) {
      return compareSubset(expectedValue, actualValue)
    }
    if (typeof expectedValue === 'function') {
      return expectedValue(actualValue)
    }
    return actualValue === expectedValue
  })
}

Assertion.addMethod('containSubset', function (expected) {
  const actual = _.flag(this, 'object')
  const showDiff = config.showDiff

  this.assert(
    compareSubset(expected, actual),
    'expected #{act} to contain subset #{exp}',
    'expected #{act} to not contain subset #{exp}',
    expected,
    actual,
    showDiff
  )
})
