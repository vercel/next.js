import type { NextTestChai } from '../chai'
import type { AssertionTask as Test } from './task-runtime'
import type { Assertion } from './types'
import { processError } from '../utils/error'
import { noop } from '../utils/helpers'
import {
  getAssertionTaskEntry,
  getVitestAssertionTaskRuntime,
} from './task-runtime'

const defineFunctionProperty = Object.defineProperty

export function createAssertionMessage(
  util: NextTestChai.ChaiUtils,
  assertion: NextTestChai.Assertion,
  hasArgs: boolean
) {
  const soft = util.flag(assertion, 'soft') ? '.soft' : ''
  const not = util.flag(assertion, 'negate') ? 'not.' : ''
  const name = `${util.flag(assertion, '_name')}(${hasArgs ? 'expected' : ''})`
  const promiseName = util.flag(assertion, 'promise')
  const promise = promiseName ? `.${promiseName}` : ''
  return `expect${soft}(actual)${promise}.${not}${name}`
}

export function recordAsyncExpect(
  _test: any,
  promise: Promise<any>,
  assertion: string,
  error: Error,
  isSoft?: boolean
): Promise<any> {
  const entry = getAssertionTaskEntry(_test)
  const test = entry?.runtimeTask || (_test as Test | undefined)
  const registeredPromiseObserver = entry?.promiseObserver
  const captureObserver = registeredPromiseObserver?.capture
  const promiseObserver = captureObserver
    ? captureObserver.call(registeredPromiseObserver)
    : registeredPromiseObserver
  const promiseOwner = registeredPromiseObserver ? _test : test
  const finishedObserver = promiseObserver?.finished
  const finishedOwner = captureObserver || finishedObserver ? _test : test
  // record promise for test, that resolves before test ends
  if (test && promise instanceof Promise) {
    // if promise is explicitly awaited, remove it from the list
    promise = promise.finally(() => {
      try {
        if (!promiseOwner.promises) {
          return
        }
        const index = promiseOwner.promises.indexOf(promise)
        if (index !== -1) {
          promiseOwner.promises.splice(index, 1)
        }
      } finally {
        promiseObserver?.settled(promise)
      }
    })

    // record promise
    if (!promiseOwner.promises) {
      promiseOwner.promises = []
    }
    // setup `expect.soft` handler here instead of `wrapAssertion`
    // to avoid double error tracking while keeping non-await promise detection.
    if (isSoft) {
      promise = promise.then(noop, (err) => {
        handleTestError(test, err)
      })
    }
    promiseOwner.promises.push(promise)
    promiseObserver?.recorded(promise)

    let resolved = false
    const captureFinished = (check: () => void) => {
      defineFunctionProperty(check, 'name', { value: '' })
      finishedObserver?.call(promiseObserver, promise, check)
      return check
    }
    finishedOwner.onFinished ??= []
    finishedOwner.onFinished.push(
      captureFinished(() => {
        if (!resolved) {
          const awaitError = new Error(
            `Promise returned by \`${assertion}\` was not awaited. This assertion is asynchronous and must be awaited; otherwise, it is not guaranteed to complete before the test finishes:\n\nawait ${assertion}\n`
          )
          if (error.stack) {
            awaitError.stack = error.stack.replace(
              error.message,
              awaitError.message
            )
          }
          throw awaitError
        }
      })
    )

    return {
      then(onFulfilled, onRejected) {
        resolved = true
        return promise.then(onFulfilled, onRejected)
      },
      catch(onRejected) {
        resolved = true
        return promise.catch(onRejected)
      },
      finally(onFinally) {
        resolved = true
        return promise.finally(onFinally)
      },
      [Symbol.toStringTag]: 'Promise',
    } satisfies Promise<any>
  }

  return promise
}

function handleTestError(test: Test, err: unknown) {
  test = getVitestAssertionTaskRuntime(test) as Test
  test.result ||= { state: 'fail' }
  test.result.state = 'fail'
  test.result.errors ||= []
  test.result.errors.push(processError(err))
}

/** wrap assertion function to support `expect.soft` and provide assertion name as `_name` */
export function wrapAssertion(
  utils: NextTestChai.ChaiUtils,
  name: string,
  fn: (
    this: NextTestChai.AssertionStatic & Assertion,
    ...args: any[]
  ) => void | PromiseLike<void>
) {
  return function (
    this: NextTestChai.AssertionStatic & Assertion,
    ...args: any[]
  ): void | PromiseLike<void> {
    // private
    if (name !== 'withTest') {
      utils.flag(this, '_name', name)
    }

    if (!utils.flag(this, 'soft')) {
      // avoid WebKit's proper tail call to preserve stacktrace offset for inline snapshot
      // https://webkit.org/blog/6240/ecmascript-6-proper-tail-calls-in-webkit
      try {
        return fn.apply(this, args)
      } finally {
        // no lint
      }
    }

    const test: Test = utils.flag(this, 'vitest-test')

    if (!test) {
      throw new Error('expect.soft() can only be used inside a test')
    }

    try {
      const result = fn.apply(this, args)

      if (
        result &&
        typeof result === 'object' &&
        typeof result.then === 'function'
      ) {
        return result.then(noop, (err) => {
          handleTestError(test, err)
        })
      }

      return result
    } catch (err) {
      handleTestError(test, err)
    }
  }
}
