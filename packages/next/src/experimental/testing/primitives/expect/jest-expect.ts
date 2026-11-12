import type { NextTestChai } from '../chai'
import type { MockInstance, MockResult, MockSettledResult } from '../spy'
import type { Constructable } from '../utils'
import type { AssertionTask as Test } from './task-runtime'
import type { AsymmetricMatcher } from './jest-asymmetric-matchers'
import type { Assertion, ChaiPlugin } from './types'
import { isMockFunction } from '../spy'
import { getChaiAssertionIdentity } from '../chai'
import { recordAsyncAssertionIdentity } from './task-runtime'
import { inspect } from '../utils/display'
import { assertTypes, ordinal } from '../utils/helpers'
import c from '../utils/colors'
import { JEST_MATCHERS_OBJECT } from './constants'
import { diff, getCustomEqualityTesters, stringify } from './jest-matcher-utils'
import {
  arrayBufferEquality,
  generateToBeMessage,
  getObjectSubset,
  isError,
  iterableEquality,
  equals as jestEquals,
  sparseArrayEquality,
  subsetEquality,
  typeEquality,
} from './jest-utils'
import {
  createAssertionMessage,
  recordAsyncExpect,
  wrapAssertion,
} from './utils'

// polyfill globals because expect can be used in node environment
declare class Node {
  contains(item: unknown): boolean
}
declare class DOMTokenList {
  value: string
  contains(item: unknown): boolean
}

// Jest Expect Compact
export const JestChaiExpect: ChaiPlugin = (chai, utils) => {
  const { AssertionError } = chai
  const customTesters = getCustomEqualityTesters()

  type AssertionMethodName = keyof Assertion | 'withTest' | 'withContext'

  function def(
    name: AssertionMethodName | AssertionMethodName[],
    fn: (this: NextTestChai.AssertionStatic & Assertion, ...args: any[]) => any
  ) {
    const addMethod = (n: AssertionMethodName) => {
      const softWrapper = wrapAssertion(utils, n, fn)
      utils.addMethod(chai.Assertion.prototype, n, softWrapper)
      utils.addMethod(
        (globalThis as any)[JEST_MATCHERS_OBJECT].matchers,
        n,
        softWrapper
      )
    }

    if (Array.isArray(name)) {
      name.forEach((n) => addMethod(n))
    } else {
      addMethod(name)
    }
  }

  ;(['throw', 'throws', 'Throw'] as const).forEach((m) => {
    utils.overwriteMethod(chai.Assertion.prototype, m, (_super: any) => {
      return function (
        this: NextTestChai.Assertion & NextTestChai.AssertionStatic,
        ...args: any[]
      ) {
        const promise = utils.flag(this, 'promise')
        const object = utils.flag(this, 'object')
        const isNot = utils.flag(this, 'negate') as boolean
        if (promise === 'rejects') {
          utils.flag(this, 'object', () => {
            throw object
          })
        }
        // if it got here, it's already resolved
        // unless it tries to resolve to a function that should throw
        // called as '.resolves[.not].toThrow()`
        else if (promise === 'resolves' && typeof object !== 'function') {
          if (!isNot) {
            const message =
              utils.flag(this, 'message') ||
              "expected promise to throw an error, but it didn't"
            const error = {
              showDiff: false,
            }
            throw new AssertionError(message, error, utils.flag(this, 'ssfi'))
          } else {
            return
          }
        }
        _super.apply(this, args)
      }
    })
  })

  def('withTest', function (test: Test) {
    utils.flag(this, 'vitest-test', test)
    return this
  })

  def('toEqual', function (expected) {
    const actual = utils.flag(this, 'object')
    const equal = jestEquals(actual, expected, [
      ...customTesters,
      iterableEquality,
    ])

    return this.assert(
      equal,
      'expected #{this} to deeply equal #{exp}',
      'expected #{this} to not deeply equal #{exp}',
      expected,
      actual
    )
  })

  def('toStrictEqual', function (expected) {
    const obj = utils.flag(this, 'object')
    const equal = jestEquals(
      obj,
      expected,
      [
        ...customTesters,
        iterableEquality,
        typeEquality,
        sparseArrayEquality,
        arrayBufferEquality,
      ],
      true
    )

    return this.assert(
      equal,
      'expected #{this} to strictly equal #{exp}',
      'expected #{this} to not strictly equal #{exp}',
      expected,
      obj
    )
  })
  def('toBe', function (expected) {
    const actual = this._obj
    const pass = Object.is(actual, expected)

    let deepEqualityName = ''

    if (!pass) {
      const toStrictEqualPass = jestEquals(
        actual,
        expected,
        [
          ...customTesters,
          iterableEquality,
          typeEquality,
          sparseArrayEquality,
          arrayBufferEquality,
        ],
        true
      )

      if (toStrictEqualPass) {
        deepEqualityName = 'toStrictEqual'
      } else {
        const toEqualPass = jestEquals(actual, expected, [
          ...customTesters,
          iterableEquality,
        ])

        if (toEqualPass) {
          deepEqualityName = 'toEqual'
        }
      }
    }

    return this.assert(
      pass,
      generateToBeMessage(deepEqualityName),
      'expected #{this} not to be #{exp} // Object.is equality',
      expected,
      actual
    )
  })
  def('toMatchObject', function (expected) {
    const actual = this._obj
    const pass = jestEquals(actual, expected, [
      ...customTesters,
      iterableEquality,
      subsetEquality,
    ])
    const isNot = utils.flag(this, 'negate') as boolean
    const { subset: actualSubset, stripped } = getObjectSubset(
      actual,
      expected,
      customTesters
    )
    if ((pass && isNot) || (!pass && !isNot)) {
      const msg = utils.getMessage(this, [
        pass,
        'expected #{this} to match object #{exp}',
        'expected #{this} to not match object #{exp}',
        expected,
        actualSubset,
        false,
      ])
      const message =
        stripped === 0
          ? msg
          : `${msg}\n(${stripped} matching ${
              stripped === 1 ? 'property' : 'properties'
            } omitted from actual)`
      throw new AssertionError(message, {
        showDiff: true,
        expected,
        actual: actualSubset,
      })
    }
  })
  def('toMatch', function (expected: string | RegExp) {
    const actual = this._obj as string
    if (typeof actual !== 'string') {
      throw new TypeError(
        `.toMatch() expects to receive a string, but got ${typeof actual}`
      )
    }

    return this.assert(
      typeof expected === 'string'
        ? actual.includes(expected)
        : actual.match(expected),
      `expected #{this} to match #{exp}`,
      `expected #{this} not to match #{exp}`,
      expected,
      actual
    )
  })
  def('toContain', function (item) {
    const actual = this._obj as Iterable<unknown> | string | Node | DOMTokenList

    if (typeof Node !== 'undefined' && actual instanceof Node) {
      if (!(item instanceof Node)) {
        throw new TypeError(
          `toContain() expected a DOM node as the argument, but got ${typeof item}`
        )
      }

      return this.assert(
        actual.contains(item),
        'expected #{this} to contain element #{exp}',
        'expected #{this} not to contain element #{exp}',
        item,
        actual
      )
    }

    if (typeof DOMTokenList !== 'undefined' && actual instanceof DOMTokenList) {
      assertTypes(item, 'class name', ['string'])
      const isNot = utils.flag(this, 'negate') as boolean
      const expectedClassList = isNot
        ? actual.value.replace(item, '').trim()
        : `${actual.value} ${item}`
      return this.assert(
        actual.contains(item),
        `expected "${actual.value}" to contain "${item}"`,
        `expected "${actual.value}" not to contain "${item}"`,
        expectedClassList,
        actual.value
      )
    }
    // handle simple case on our own using `this.assert` to include diff in error message
    if (typeof actual === 'string' && typeof item === 'string') {
      return this.assert(
        actual.includes(item),
        `expected #{this} to contain #{exp}`,
        `expected #{this} not to contain #{exp}`,
        item,
        actual
      )
    }
    // make "actual" indexable to have compatibility with jest
    if (actual != null && typeof actual !== 'string') {
      utils.flag(this, 'object', Array.from(actual as Iterable<unknown>))
    }
    return this.contain(item)
  })
  def('toContainEqual', function (expected) {
    const obj = utils.flag(this, 'object')
    const index = Array.from(obj).findIndex((item) => {
      return jestEquals(item, expected, [...customTesters, iterableEquality])
    })

    this.assert(
      index !== -1,
      'expected #{this} to deep equally contain #{exp}',
      'expected #{this} to not deep equally contain #{exp}',
      expected
    )
  })
  def('toBeTruthy', function () {
    const obj = utils.flag(this, 'object')
    this.assert(
      Boolean(obj),
      'expected #{this} to be truthy',
      'expected #{this} to not be truthy',
      true,
      obj
    )
  })
  def('toBeFalsy', function () {
    const obj = utils.flag(this, 'object')
    this.assert(
      !obj,
      'expected #{this} to be falsy',
      'expected #{this} to not be falsy',
      false,
      obj
    )
  })
  def('toBeGreaterThan', function (expected: number | bigint) {
    const actual = this._obj as number | bigint
    assertTypes(actual, 'actual', ['number', 'bigint'])
    assertTypes(expected, 'expected', ['number', 'bigint'])
    return this.assert(
      actual > expected,
      `expected ${actual} to be greater than ${expected}`,
      `expected ${actual} to be not greater than ${expected}`,
      expected,
      actual,
      false
    )
  })
  def('toBeGreaterThanOrEqual', function (expected: number | bigint) {
    const actual = this._obj as number | bigint
    assertTypes(actual, 'actual', ['number', 'bigint'])
    assertTypes(expected, 'expected', ['number', 'bigint'])
    return this.assert(
      actual >= expected,
      `expected ${actual} to be greater than or equal to ${expected}`,
      `expected ${actual} to be not greater than or equal to ${expected}`,
      expected,
      actual,
      false
    )
  })
  def('toBeLessThan', function (expected: number | bigint) {
    const actual = this._obj as number | bigint
    assertTypes(actual, 'actual', ['number', 'bigint'])
    assertTypes(expected, 'expected', ['number', 'bigint'])
    return this.assert(
      actual < expected,
      `expected ${actual} to be less than ${expected}`,
      `expected ${actual} to be not less than ${expected}`,
      expected,
      actual,
      false
    )
  })
  def('toBeLessThanOrEqual', function (expected: number | bigint) {
    const actual = this._obj as number | bigint
    assertTypes(actual, 'actual', ['number', 'bigint'])
    assertTypes(expected, 'expected', ['number', 'bigint'])
    return this.assert(
      actual <= expected,
      `expected ${actual} to be less than or equal to ${expected}`,
      `expected ${actual} to be not less than or equal to ${expected}`,
      expected,
      actual,
      false
    )
  })
  def('toBeNaN', function () {
    const obj = utils.flag(this, 'object')
    this.assert(
      Number.isNaN(obj),
      'expected #{this} to be NaN',
      'expected #{this} not to be NaN',
      Number.NaN,
      obj
    )
  })
  def('toBeUndefined', function () {
    const obj = utils.flag(this, 'object')
    this.assert(
      undefined === obj,
      'expected #{this} to be undefined',
      'expected #{this} not to be undefined',
      undefined,
      obj
    )
  })
  def('toBeNull', function () {
    const obj = utils.flag(this, 'object')
    this.assert(
      obj === null,
      'expected #{this} to be null',
      'expected #{this} not to be null',
      null,
      obj
    )
  })
  def('toBeNullable', function () {
    const obj = utils.flag(this, 'object')
    this.assert(
      obj == null,
      'expected #{this} to be nullish',
      'expected #{this} not to be nullish',
      null,
      obj
    )
  })
  def('toBeDefined', function () {
    const obj = utils.flag(this, 'object')
    this.assert(
      typeof obj !== 'undefined',
      'expected #{this} to be defined',
      'expected #{this} to be undefined',
      obj
    )
  })
  def(
    'toBeTypeOf',
    function (
      expected:
        | 'bigint'
        | 'boolean'
        | 'function'
        | 'number'
        | 'object'
        | 'string'
        | 'symbol'
        | 'undefined'
    ) {
      const actual = typeof this._obj
      const equal = expected === actual
      return this.assert(
        equal,
        'expected #{this} to be type of #{exp}',
        'expected #{this} not to be type of #{exp}',
        expected,
        actual
      )
    }
  )
  def('toBeInstanceOf', function (obj: any) {
    return this.instanceOf(obj)
  })
  def('toHaveLength', function (length: number) {
    return this.have.length(length)
  })
  // destructuring, because it checks `arguments` inside, and value is passing as `undefined`
  def(
    'toHaveProperty',
    function (...args: [property: string | (string | number)[], value?: any]) {
      if (Array.isArray(args[0])) {
        args[0] = args[0]
          .map((key) => String(key).replace(/([.[\]])/g, '\\$1'))
          .join('.')
      }

      const actual = this._obj as any
      if (actual == null) {
        throw new TypeError(
          `.toHaveProperty() expects to receive a valid object, but got ${actual}`
        )
      }
      const [propertyName, expected] = args
      const getValue = () => {
        const hasOwn = Object.hasOwn(actual, propertyName)
        if (hasOwn) {
          return { value: actual[propertyName], exists: true }
        }
        return utils.getPathInfo(actual, propertyName)
      }
      const { value, exists } = getValue()
      const pass =
        exists &&
        (args.length === 1 ||
          jestEquals(expected, value, [...customTesters, iterableEquality]))

      const valueString =
        args.length === 1
          ? ''
          : ` with value ${inspect(expected, { truncate: 40 })}`

      return this.assert(
        pass,
        `expected #{this} to have property "${propertyName}"${valueString}`,
        `expected #{this} to not have property "${propertyName}"${valueString}`,
        expected,
        exists ? value : undefined
      )
    }
  )
  def('toBeCloseTo', function (received: number, precision = 2) {
    const expected = this._obj
    let pass = false
    let expectedDiff = 0
    let receivedDiff = 0

    if (
      received === Number.POSITIVE_INFINITY &&
      expected === Number.POSITIVE_INFINITY
    ) {
      pass = true
    } else if (
      received === Number.NEGATIVE_INFINITY &&
      expected === Number.NEGATIVE_INFINITY
    ) {
      pass = true
    } else {
      expectedDiff = 10 ** -precision / 2
      receivedDiff = Math.abs(expected - received)
      pass = receivedDiff < expectedDiff
    }
    return this.assert(
      pass,
      `expected #{this} to be close to #{exp}, received difference is ${receivedDiff}, but expected ${expectedDiff}`,
      `expected #{this} to not be close to #{exp}, received difference is ${receivedDiff}, but expected ${expectedDiff}`,
      received,
      expected,
      false
    )
  })

  function assertIsMock(assertion: any) {
    if (!isMockFunction(assertion._obj)) {
      throw new TypeError(
        `${utils.inspect(assertion._obj)} is not a spy or a call to a spy!`
      )
    }
  }

  function getSpy(assertion: any) {
    assertIsMock(assertion)
    return assertion._obj as MockInstance
  }

  def(['toHaveBeenCalledTimes', 'toBeCalledTimes'], function (number: number) {
    const spy = getSpy(this)
    const spyName = spy.getMockName()
    const callCount = spy.mock.calls.length
    return this.assert(
      callCount === number,
      `expected "${spyName}" to be called #{exp} times, but got ${callCount} times`,
      `expected "${spyName}" to not be called #{exp} times`,
      number,
      callCount,
      false
    )
  })
  def('toHaveBeenCalledOnce', function () {
    const spy = getSpy(this)
    const spyName = spy.getMockName()
    const callCount = spy.mock.calls.length
    return this.assert(
      callCount === 1,
      `expected "${spyName}" to be called once, but got ${callCount} times`,
      `expected "${spyName}" to not be called once`,
      1,
      callCount,
      false
    )
  })
  def(['toHaveBeenCalled', 'toBeCalled'], function () {
    const spy = getSpy(this)
    const spyName = spy.getMockName()
    const callCount = spy.mock.calls.length
    const called = callCount > 0
    const isNot = utils.flag(this, 'negate') as boolean
    let msg = utils.getMessage(this, [
      called,
      `expected "${spyName}" to be called at least once`,
      `expected "${spyName}" to not be called at all, but actually been called ${callCount} times`,
      true,
      called,
    ])
    if (called && isNot) {
      msg = formatCalls(spy, msg)
    }

    if ((called && isNot) || (!called && !isNot)) {
      throw new AssertionError(msg)
    }
  })

  // manually compare array elements since `jestEquals` cannot
  // apply asymmetric matcher to `undefined` array element.
  function equalsArgumentArray(a: unknown[], b: unknown[]) {
    return (
      a.length === b.length &&
      a.every((aItem, i) =>
        jestEquals(aItem, b[i], [...customTesters, iterableEquality])
      )
    )
  }

  def(['toHaveBeenCalledWith', 'toBeCalledWith'], function (...args) {
    const spy = getSpy(this)
    const spyName = spy.getMockName()
    const pass = spy.mock.calls.some((callArg) =>
      equalsArgumentArray(callArg, args)
    )
    const isNot = utils.flag(this, 'negate') as boolean

    if ((pass && isNot) || (!pass && !isNot)) {
      const msg = utils.getMessage(this, [
        pass,
        `expected "${spyName}" to be called with arguments: #{exp}`,
        `expected "${spyName}" to not be called with arguments: #{exp}`,
        args,
      ])
      throw new AssertionError(formatCalls(spy, msg, args))
    }
  })
  def('toHaveBeenCalledExactlyOnceWith', function (...args) {
    const spy = getSpy(this)
    const spyName = spy.getMockName()
    const callCount = spy.mock.calls.length
    const hasCallWithArgs = spy.mock.calls.some((callArg) =>
      equalsArgumentArray(callArg, args)
    )
    const pass = hasCallWithArgs && callCount === 1
    const isNot = utils.flag(this, 'negate') as boolean

    if ((pass && isNot) || (!pass && !isNot)) {
      const msg = utils.getMessage(this, [
        pass,
        `expected "${spyName}" to be called once with arguments: #{exp}`,
        `expected "${spyName}" to not be called once with arguments: #{exp}`,
        args,
      ])
      throw new AssertionError(formatCalls(spy, msg, args))
    }
  })
  def('toHaveBeenNthCalledWith', function (times: number, ...args: any[]) {
    const spy = getSpy(this)
    const spyName = spy.getMockName()
    const nthCall = spy.mock.calls[times - 1]
    const callCount = spy.mock.calls.length
    const isCalled = times <= callCount
    this.assert(
      nthCall && equalsArgumentArray(nthCall, args),
      `expected ${ordinal(times)} "${spyName}" call to have been called with #{exp}${
        isCalled ? `` : `, but called only ${callCount} times`
      }`,
      `expected ${ordinal(times)} "${spyName}" call to not have been called with #{exp}`,
      args,
      nthCall,
      isCalled
    )
  })
  def('toHaveBeenLastCalledWith', function (...args: any[]) {
    const spy = getSpy(this)
    const spyName = spy.getMockName()
    const lastCall = spy.mock.calls.at(-1)

    this.assert(
      lastCall && equalsArgumentArray(lastCall, args),
      `expected last "${spyName}" call to have been called with #{exp}`,
      `expected last "${spyName}" call to not have been called with #{exp}`,
      args,
      lastCall
    )
  })

  /**
   * Used for `toHaveBeenCalledBefore` and `toHaveBeenCalledAfter` to determine if the expected spy was called before the result spy.
   */
  function isSpyCalledBeforeAnotherSpy(
    beforeSpy: MockInstance,
    afterSpy: MockInstance,
    failIfNoFirstInvocation: number
  ): boolean {
    const beforeInvocationCallOrder = beforeSpy.mock.invocationCallOrder

    const afterInvocationCallOrder = afterSpy.mock.invocationCallOrder

    if (beforeInvocationCallOrder.length === 0) {
      return !failIfNoFirstInvocation
    }

    if (afterInvocationCallOrder.length === 0) {
      return false
    }

    return beforeInvocationCallOrder[0] < afterInvocationCallOrder[0]
  }

  def(
    ['toHaveBeenCalledBefore'],
    function (resultSpy: MockInstance, failIfNoFirstInvocation = true) {
      const expectSpy = getSpy(this)

      if (!isMockFunction(resultSpy)) {
        throw new TypeError(
          `${utils.inspect(resultSpy)} is not a spy or a call to a spy`
        )
      }

      this.assert(
        isSpyCalledBeforeAnotherSpy(
          expectSpy,
          resultSpy,
          failIfNoFirstInvocation
        ),
        `expected "${expectSpy.getMockName()}" to have been called before "${resultSpy.getMockName()}"`,
        `expected "${expectSpy.getMockName()}" to not have been called before "${resultSpy.getMockName()}"`,
        resultSpy,
        expectSpy
      )
    }
  )
  def(
    ['toHaveBeenCalledAfter'],
    function (resultSpy: MockInstance, failIfNoFirstInvocation = true) {
      const expectSpy = getSpy(this)

      if (!isMockFunction(resultSpy)) {
        throw new TypeError(
          `${utils.inspect(resultSpy)} is not a spy or a call to a spy`
        )
      }

      this.assert(
        isSpyCalledBeforeAnotherSpy(
          resultSpy,
          expectSpy,
          failIfNoFirstInvocation
        ),
        `expected "${expectSpy.getMockName()}" to have been called after "${resultSpy.getMockName()}"`,
        `expected "${expectSpy.getMockName()}" to not have been called after "${resultSpy.getMockName()}"`,
        resultSpy,
        expectSpy
      )
    }
  )
  def(
    ['toThrow', 'toThrowError'],
    function (expected?: string | Constructable | RegExp | Error) {
      if (
        typeof expected === 'string' ||
        typeof expected === 'undefined' ||
        expected instanceof RegExp
      ) {
        return this.throws(expected)
      }

      const obj = this._obj
      const promise = utils.flag(this, 'promise')
      const isNot = utils.flag(this, 'negate') as boolean
      let thrown: any = null

      if (promise === 'rejects') {
        thrown = obj
      }
      // if it got here, it's already resolved
      // unless it tries to resolve to a function that should throw
      // called as .resolves.toThrow(Error)
      else if (promise === 'resolves' && typeof obj !== 'function') {
        if (!isNot) {
          const message =
            utils.flag(this, 'message') ||
            "expected promise to throw an error, but it didn't"
          const error = {
            showDiff: false,
          }
          throw new AssertionError(message, error, utils.flag(this, 'ssfi'))
        } else {
          return
        }
      } else {
        let isThrow = false
        try {
          obj()
        } catch (err) {
          isThrow = true
          thrown = err
        }

        if (!isThrow && !isNot) {
          const message =
            utils.flag(this, 'message') ||
            "expected function to throw an error, but it didn't"
          const error = {
            showDiff: false,
          }
          throw new AssertionError(message, error, utils.flag(this, 'ssfi'))
        }
      }

      if (typeof expected === 'function') {
        const name = expected.name || expected.prototype.constructor.name
        return this.assert(
          thrown && thrown instanceof expected,
          `expected error to be instance of ${name}`,
          `expected error not to be instance of ${name}`,
          expected,
          thrown
        )
      }

      if (isError(expected)) {
        const equal = jestEquals(thrown, expected, [
          ...customTesters,
          iterableEquality,
        ])
        return this.assert(
          equal,
          'expected a thrown error to be #{exp}',
          'expected a thrown error not to be #{exp}',
          expected,
          thrown
        )
      }

      if (
        typeof expected === 'object' &&
        'asymmetricMatch' in expected &&
        typeof (expected as any).asymmetricMatch === 'function'
      ) {
        const matcher = expected as any as AsymmetricMatcher<any>
        return this.assert(
          thrown &&
            matcher.asymmetricMatch(thrown, [
              ...customTesters,
              iterableEquality,
            ]),
          'expected error to match asymmetric matcher',
          'expected error not to match asymmetric matcher',
          matcher,
          thrown
        )
      }

      const equal = jestEquals(thrown, expected, [
        ...customTesters,
        iterableEquality,
      ])
      return this.assert(
        equal,
        'expected a thrown value to equal #{exp}',
        'expected a thrown value not to equal #{exp}',
        expected,
        thrown
      )
    }
  )

  interface ReturnMatcher<T extends any[] = []> {
    name: keyof Assertion | (keyof Assertion)[]
    condition: (spy: MockInstance, ...args: T) => boolean
    action: string
  }

  ;(
    [
      {
        name: 'toHaveResolved',
        condition: (spy) =>
          spy.mock.settledResults.length > 0 &&
          spy.mock.settledResults.some(({ type }) => type === 'fulfilled'),
        action: 'resolved',
      },
      {
        name: ['toHaveReturned', 'toReturn'],
        condition: (spy) =>
          spy.mock.calls.length > 0 &&
          spy.mock.results.some(({ type }) => type !== 'throw'),
        action: 'called',
      },
    ] satisfies ReturnMatcher[]
  ).forEach(({ name, condition, action }) => {
    def(name, function () {
      const spy = getSpy(this)
      const spyName = spy.getMockName()
      const pass = condition(spy)
      this.assert(
        pass,
        `expected "${spyName}" to be successfully ${action} at least once`,
        `expected "${spyName}" to not be successfully ${action}`,
        pass,
        !pass,
        false
      )
    })
  })
  ;(
    [
      {
        name: 'toHaveResolvedTimes',
        condition: (spy, times) =>
          spy.mock.settledResults.reduce(
            (s, { type }) => (type === 'fulfilled' ? ++s : s),
            0
          ) === times,
        action: 'resolved',
      },
      {
        name: ['toHaveReturnedTimes', 'toReturnTimes'],
        condition: (spy, times) =>
          spy.mock.results.reduce(
            (s, { type }) => (type === 'throw' ? s : ++s),
            0
          ) === times,
        action: 'called',
      },
    ] satisfies ReturnMatcher<[number]>[]
  ).forEach(({ name, condition, action }) => {
    def(name, function (times: number) {
      const spy = getSpy(this)
      const spyName = spy.getMockName()
      const pass = condition(spy, times)
      this.assert(
        pass,
        `expected "${spyName}" to be successfully ${action} ${times} times`,
        `expected "${spyName}" to not be successfully ${action} ${times} times`,
        `expected resolved times: ${times}`,
        `received resolved times: ${pass}`,
        false
      )
    })
  })
  ;(
    [
      {
        name: 'toHaveResolvedWith',
        condition: (spy, value) =>
          spy.mock.settledResults.some(
            ({ type, value: result }) =>
              type === 'fulfilled' &&
              jestEquals(value, result, [...customTesters, iterableEquality])
          ),
        action: 'resolve',
      },
      {
        name: ['toHaveReturnedWith', 'toReturnWith'],
        condition: (spy, value) =>
          spy.mock.results.some(
            ({ type, value: result }) =>
              type === 'return' &&
              jestEquals(value, result, [...customTesters, iterableEquality])
          ),
        action: 'return',
      },
    ] satisfies ReturnMatcher<[any]>[]
  ).forEach(({ name, condition, action }) => {
    def(name, function (value: any) {
      const spy = getSpy(this)
      const pass = condition(spy, value)
      const isNot = utils.flag(this, 'negate') as boolean

      if ((pass && isNot) || (!pass && !isNot)) {
        const spyName = spy.getMockName()
        const msg = utils.getMessage(this, [
          pass,
          `expected "${spyName}" to ${action} with: #{exp} at least once`,
          `expected "${spyName}" to not ${action} with: #{exp}`,
          value,
        ])

        const results =
          action === 'return' ? spy.mock.results : spy.mock.settledResults
        throw new AssertionError(formatReturns(spy, results, msg, value))
      }
    })
  })
  ;(
    [
      {
        name: 'toHaveLastResolvedWith',
        condition: (spy, value) => {
          const result = spy.mock.settledResults.at(-1)
          return Boolean(
            result &&
              result.type === 'fulfilled' &&
              jestEquals(result.value, value, [
                ...customTesters,
                iterableEquality,
              ])
          )
        },
        action: 'resolve',
      },
      {
        name: 'toHaveLastReturnedWith',
        condition: (spy, value) => {
          const result = spy.mock.results.at(-1)
          return Boolean(
            result &&
              result.type === 'return' &&
              jestEquals(result.value, value, [
                ...customTesters,
                iterableEquality,
              ])
          )
        },
        action: 'return',
      },
    ] satisfies ReturnMatcher<[any]>[]
  ).forEach(({ name, condition, action }) => {
    def(name, function (value: any) {
      const spy = getSpy(this)
      const results =
        action === 'return' ? spy.mock.results : spy.mock.settledResults
      const result = results.at(-1)
      const spyName = spy.getMockName()
      this.assert(
        condition(spy, value),
        `expected last "${spyName}" call to ${action} #{exp}`,
        `expected last "${spyName}" call to not ${action} #{exp}`,
        value,
        result?.value
      )
    })
  })
  ;(
    [
      {
        name: 'toHaveNthResolvedWith',
        condition: (spy, index, value) => {
          const result = spy.mock.settledResults[index - 1]
          return (
            result &&
            result.type === 'fulfilled' &&
            jestEquals(result.value, value, [
              ...customTesters,
              iterableEquality,
            ])
          )
        },
        action: 'resolve',
      },
      {
        name: 'toHaveNthReturnedWith',
        condition: (spy, index, value) => {
          const result = spy.mock.results[index - 1]
          return (
            result &&
            result.type === 'return' &&
            jestEquals(result.value, value, [
              ...customTesters,
              iterableEquality,
            ])
          )
        },
        action: 'return',
      },
    ] satisfies ReturnMatcher<[number, any]>[]
  ).forEach(({ name, condition, action }) => {
    def(name, function (nthCall: number, value: any) {
      const spy = getSpy(this)
      const spyName = spy.getMockName()
      const results =
        action === 'return' ? spy.mock.results : spy.mock.settledResults
      const result = results[nthCall - 1]
      const ordinalCall = `${ordinal(nthCall)} call`

      this.assert(
        condition(spy, nthCall, value),
        `expected ${ordinalCall} "${spyName}" call to ${action} #{exp}`,
        `expected ${ordinalCall} "${spyName}" call to not ${action} #{exp}`,
        value,
        result?.value
      )
    })
  })

  def('withContext', function (this: any, context: Record<string, any>) {
    for (const key in context) {
      utils.flag(this, key, context[key])
    }
    return this
  })

  utils.addProperty(
    chai.Assertion.prototype,
    'resolves',
    function __VITEST_RESOLVES__(this: any) {
      const error = new Error('resolves')
      utils.flag(this, 'promise', 'resolves')
      utils.flag(this, 'error', error)
      const test: Test = utils.flag(this, 'vitest-test')
      const obj = utils.flag(this, 'object')

      if (utils.flag(this, 'poll')) {
        throw new SyntaxError(
          `expect.poll() is not supported in combination with .resolves`
        )
      }

      if (typeof obj?.then !== 'function') {
        throw new TypeError(
          `You must provide a Promise to expect() when using .resolves, not '${typeof obj}'.`
        )
      }

      const proxy: any = new Proxy(this, {
        get: (target, key, receiver) => {
          const result = Reflect.get(target, key, receiver)

          if (typeof result !== 'function') {
            return result instanceof chai.Assertion ? proxy : result
          }

          return (...args: any[]) => {
            utils.flag(this, '_name', key)
            const promise = Promise.resolve(obj)
              .then(
                (value: any) => {
                  utils.flag(this, 'object', value)
                  return result.call(this, ...args)
                },
                (err: any) => {
                  const _error = new AssertionError(
                    `promise rejected "${utils.inspect(err)}" instead of resolving`,
                    { showDiff: false }
                  ) as Error
                  _error.cause = err
                  throw _error
                }
              )
              .catch((err: any) => {
                if (isError(err) && error.stack) {
                  err.stack = error.stack.replace(error.message, err.message)
                }
                throw err
              })

            return recordAsyncExpect(
              test,
              promise,
              createAssertionMessage(utils, this, !!args.length),
              error,
              utils.flag(this, 'soft')
            )
          }
        },
      })

      const identity = getChaiAssertionIdentity(this)
      if (identity) recordAsyncAssertionIdentity(proxy, identity)
      return proxy
    }
  )

  utils.addProperty(
    chai.Assertion.prototype,
    'rejects',
    function __VITEST_REJECTS__(this: any) {
      const error = new Error('rejects')
      utils.flag(this, 'promise', 'rejects')
      utils.flag(this, 'error', error)
      const test: Test = utils.flag(this, 'vitest-test')
      const obj = utils.flag(this, 'object')
      const wrapper = typeof obj === 'function' ? obj() : obj // for jest compat

      if (utils.flag(this, 'poll')) {
        throw new SyntaxError(
          `expect.poll() is not supported in combination with .rejects`
        )
      }

      if (typeof wrapper?.then !== 'function') {
        throw new TypeError(
          `You must provide a Promise to expect() when using .rejects, not '${typeof wrapper}'.`
        )
      }

      const proxy: any = new Proxy(this, {
        get: (target, key, receiver) => {
          const result = Reflect.get(target, key, receiver)

          if (typeof result !== 'function') {
            return result instanceof chai.Assertion ? proxy : result
          }

          return (...args: any[]) => {
            utils.flag(this, '_name', key)
            const promise = Promise.resolve(wrapper)
              .then(
                (value: any) => {
                  const _error = new AssertionError(
                    `promise resolved "${utils.inspect(value)}" instead of rejecting`,
                    {
                      showDiff: true,
                      expected: new Error('rejected promise'),
                      actual: value,
                    }
                  ) as any
                  throw _error
                },
                (err: any) => {
                  utils.flag(this, 'object', err)
                  return result.call(this, ...args)
                }
              )
              .catch((err: any) => {
                if (isError(err) && error.stack) {
                  err.stack = error.stack.replace(error.message, err.message)
                }
                throw err
              })

            return recordAsyncExpect(
              test,
              promise,
              createAssertionMessage(utils, this, !!args.length),
              error,
              utils.flag(this, 'soft')
            )
          }
        },
      })

      const identity = getChaiAssertionIdentity(this)
      if (identity) recordAsyncAssertionIdentity(proxy, identity)
      return proxy
    }
  )
}

function formatCalls(spy: MockInstance, msg: string, showActualCall?: any) {
  if (spy.mock.calls.length) {
    msg += c.gray(
      `\n\nReceived:\n\n${spy.mock.calls
        .map((callArg, i) => {
          let methodCall = c.bold(
            `  ${ordinal(i + 1)} ${spy.getMockName()} call:\n\n`
          )
          if (showActualCall) {
            methodCall += diff(showActualCall, callArg, {
              omitAnnotationLines: true,
            })
          } else {
            methodCall += stringify(callArg)
              .split('\n')
              .map((line) => `    ${line}`)
              .join('\n')
          }

          methodCall += '\n'
          return methodCall
        })
        .join('\n')}`
    )
  }
  msg += c.gray(`\n\nNumber of calls: ${c.bold(spy.mock.calls.length)}\n`)
  return msg
}

function formatReturns(
  spy: MockInstance,
  results: MockResult<any>[] | MockSettledResult<any>[],
  msg: string,
  showActualReturn?: any
) {
  if (results.length) {
    msg += c.gray(
      `\n\nReceived:\n\n${results
        .map((callReturn, i) => {
          let methodCall = c.bold(
            `  ${ordinal(i + 1)} ${spy.getMockName()} call return:\n\n`
          )
          if (showActualReturn) {
            methodCall += diff(showActualReturn, callReturn.value, {
              omitAnnotationLines: true,
            })
          } else {
            methodCall += stringify(callReturn)
              .split('\n')
              .map((line) => `    ${line}`)
              .join('\n')
          }

          methodCall += '\n'
          return methodCall
        })
        .join('\n')}`
    )
  }
  msg += c.gray(`\n\nNumber of calls: ${c.bold(spy.mock.calls.length)}\n`)
  return msg
}
