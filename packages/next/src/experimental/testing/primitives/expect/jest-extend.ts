import type { NextTestChai } from '../chai'
import type { AssertionTask as Test } from './task-runtime'
import type {
  Assertion,
  ChaiPlugin,
  ExpectStatic,
  MatchersObject,
  MatcherState,
  SyncExpectationResult,
  Tester,
} from './types'
import { use, util } from '../chai'
import { ASYMMETRIC_MATCHERS_OBJECT, JEST_MATCHERS_OBJECT } from './constants'
import { AsymmetricMatcher } from './jest-asymmetric-matchers'
import {
  diff,
  getCustomEqualityTesters,
  getMatcherUtils,
  stringify,
} from './jest-matcher-utils'
import { equals, iterableEquality, subsetEquality } from './jest-utils'
import { getState } from './state'
import { wrapAssertion } from './utils'

function getMatcherState(
  assertion: NextTestChai.AssertionStatic & Assertion,
  expect: ExpectStatic
) {
  const obj = assertion._obj
  const isNot = util.flag(assertion, 'negate') as boolean
  const promise = util.flag(assertion, 'promise') || ''
  const customMessage = util.flag(assertion, 'message') as string | undefined
  const jestUtils = {
    ...getMatcherUtils(),
    diff,
    stringify,
    iterableEquality,
    subsetEquality,
  }
  let task: Test | undefined = util.flag(assertion, 'vitest-test')
  const currentTestName = task?.fullTestName ?? ''

  if (task?.type !== 'test') {
    task = undefined
  }

  const matcherState: MatcherState = {
    ...getState(expect),
    currentTestName,
    customTesters: getCustomEqualityTesters(),
    isNot,
    utils: jestUtils,
    promise,
    equals,
    // needed for built-in jest-snapshots, but we don't use it
    suppressedErrors: [],
    soft: util.flag(assertion, 'soft') as boolean | undefined,
    poll: util.flag(assertion, 'poll') as boolean | undefined,
    assertion: assertion as any,
  }
  Object.assign(matcherState, { task })

  return {
    state: matcherState,
    isNot,
    obj,
    customMessage,
  }
}

interface VitestErrorContext {
  assertionName: string
  meta?: object
}

class JestExtendError extends Error {
  constructor(
    message: string,
    public actual?: any,
    public expected?: any,
    /** @internal */
    public __vitest_error_context__?: VitestErrorContext
  ) {
    super(message)
  }
}

function JestExtendPlugin(
  c: NextTestChai.ChaiStatic,
  expect: ExpectStatic,
  matchers: MatchersObject
): ChaiPlugin {
  return (_, utils) => {
    Object.entries(matchers).forEach(
      ([expectAssertionName, expectAssertion]) => {
        function __VITEST_EXTEND_ASSERTION__(
          this: NextTestChai.AssertionStatic & Assertion,
          ...args: any[]
        ) {
          const { state, isNot, obj, customMessage } = getMatcherState(
            this,
            expect
          )

          const result = expectAssertion.call(state, obj, ...args)

          if (
            result &&
            typeof result === 'object' &&
            typeof (result as any).then === 'function'
          ) {
            const thenable = result as PromiseLike<SyncExpectationResult>
            return thenable.then(
              ({ pass, message, actual, expected, meta }) => {
                if ((pass && isNot) || (!pass && !isNot)) {
                  const errorMessage =
                    (customMessage ? `${customMessage}: ` : '') + message()
                  throw new JestExtendError(errorMessage, actual, expected, {
                    assertionName: expectAssertionName,
                    meta,
                  })
                }
              }
            )
          }

          const { pass, message, actual, expected, meta } =
            result as SyncExpectationResult

          if ((pass && isNot) || (!pass && !isNot)) {
            const errorMessage =
              (customMessage ? `${customMessage}: ` : '') + message()
            throw new JestExtendError(errorMessage, actual, expected, {
              assertionName: expectAssertionName,
              meta,
            })
          }
        }

        const softWrapper = wrapAssertion(
          utils,
          expectAssertionName,
          __VITEST_EXTEND_ASSERTION__
        )
        utils.addMethod(
          (globalThis as any)[JEST_MATCHERS_OBJECT].matchers,
          expectAssertionName,
          softWrapper
        )
        utils.addMethod(c.Assertion.prototype, expectAssertionName, softWrapper)

        // `expect.poll()` inspects the installed Chai assertion method,
        // so copy the internal marker from the original matcher function.
        // this is only for domain snapshot matchers for now.
        if ((expectAssertion as any).__vitest_poll_takeover__) {
          const addedMethod = (c.Assertion.prototype as any)[
            expectAssertionName
          ]
          Object.defineProperty(addedMethod, '__vitest_poll_takeover__', {
            value: true,
          })
        }

        class CustomMatcher extends AsymmetricMatcher<[unknown, ...unknown[]]> {
          constructor(inverse = false, ...sample: [unknown, ...unknown[]]) {
            super(sample, inverse)
          }

          asymmetricMatch(other: unknown, customTesters?: Array<Tester>) {
            const context = this.getMatcherContext(expect)
            const { pass } = expectAssertion.call(
              customTesters ? { ...context, customTesters } : context,
              other,
              ...this.sample
            ) as SyncExpectationResult

            return this.inverse ? !pass : pass
          }

          toString() {
            return `${this.inverse ? 'not.' : ''}${expectAssertionName}`
          }

          getExpectedType() {
            return 'any'
          }

          toAsymmetricMatcher() {
            return `${this.toString()}<${this.sample.map((item) => stringify(item)).join(', ')}>`
          }
        }

        const customMatcher = (...sample: [unknown, ...unknown[]]) =>
          new CustomMatcher(false, ...sample)

        Object.defineProperty(expect, expectAssertionName, {
          configurable: true,
          enumerable: true,
          value: customMatcher,
          writable: true,
        })

        Object.defineProperty(expect.not, expectAssertionName, {
          configurable: true,
          enumerable: true,
          value: (...sample: [unknown, ...unknown[]]) =>
            new CustomMatcher(true, ...sample),
          writable: true,
        })

        // keep track of asymmetric matchers on global so that it can be copied over to local context's `expect`.
        // note that the negated variant is automatically shared since it's assigned on the single `expect.not` object.
        Object.defineProperty(
          (globalThis as any)[ASYMMETRIC_MATCHERS_OBJECT],
          expectAssertionName,
          {
            configurable: true,
            enumerable: true,
            value: customMatcher,
            writable: true,
          }
        )
      }
    )
  }
}

export const JestExtend: ChaiPlugin = (chai, utils) => {
  utils.addMethod(
    chai.expect,
    'extend',
    (expect: ExpectStatic, expects: MatchersObject) => {
      use(JestExtendPlugin(chai, expect, expects))
    }
  )
}
