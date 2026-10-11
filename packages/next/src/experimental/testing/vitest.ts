import { getTestApi, getActiveAttempt, getAssertionRuntime } from './runner'
import type { TestExpect } from './assertions'
export type { TestContext, TestBody } from './runner/collector'
export type {
  Matchers,
  TestExpect,
  TestAssertion,
  MatcherState,
  MatchersObject,
  Mock,
  MockInstance,
} from './assertions'
import {
  unsupported,
  type TestDeclaration,
  type SuiteDeclaration,
  type TestBody,
} from './runner/collector'

// Resolve on use: setup helpers and the spec must share the emitted runner instance.
function declaration(name: 'test' | 'describe'): any {
  return new Proxy(
    function (...args: unknown[]) {
      return Reflect.apply(getTestApi()[name], undefined, args)
    },
    {
      get(_target, key) {
        return Reflect.get(getTestApi()[name], key)
      },
    }
  )
}

export const test: TestDeclaration = declaration('test')
export const it = test
export const describe: SuiteDeclaration = declaration('describe')
export const suite = describe
export const beforeAll = (fn: TestBody, timeout?: number) =>
  getTestApi().beforeAll(fn, timeout)
export const afterAll = (fn: TestBody, timeout?: number) =>
  getTestApi().afterAll(fn, timeout)
export const beforeEach = (fn: TestBody, timeout?: number) =>
  getTestApi().beforeEach(fn, timeout)
export const afterEach = (fn: TestBody, timeout?: number) =>
  getTestApi().afterEach(fn, timeout)
export function onTestFinished(handler: TestBody, timeout?: number) {
  const context = getActiveAttempt()
  if (!context) throw new Error('onTestFinished requires an active test.')
  context.onTestFinished(handler, timeout)
}

const expectMethods = new Map<PropertyKey, Function>()
export const expect: TestExpect = new Proxy(
  function (actual: unknown, message?: string) {
    return getAssertionRuntime().expect(actual, message)
  } as TestExpect,
  {
    get(_target, key) {
      const value = Reflect.get(getAssertionRuntime().expect, key)
      if (value === undefined && typeof key === 'string')
        unsupported(`expect.${key}`)
      if (typeof value === 'function') {
        let method = expectMethods.get(key)
        if (!method) {
          method = (...args: unknown[]) => {
            const runtime = getAssertionRuntime()
            return Reflect.apply(
              Reflect.get(runtime.expect, key),
              runtime.expect,
              args
            )
          }
          expectMethods.set(key, method)
        }
        return method
      }
      return value
    },
  }
)

type SpyApi = Pick<
  ReturnType<typeof getAssertionRuntime>['spies'],
  | 'fn'
  | 'spyOn'
  | 'isMockFunction'
  | 'clearAllMocks'
  | 'resetAllMocks'
  | 'restoreAllMocks'
>
type UtilityApi = Omit<
  ReturnType<typeof getAssertionRuntime>['utilities'],
  'dispose'
>
type StaticMockApi = {
  /**
   * Compiler-only: requires a literal path (or literal import()) and an inline
   * factory with statically named exports. Untransformed calls throw; graph
   * support is capability-gated.
   */
  mock<T extends object = Record<string, unknown>>(
    path: string | Promise<T>,
    factory: (
      importOriginal: <Original extends T = T>() => Promise<Original>
    ) =>
      | (Partial<T> & Record<string, unknown>)
      | Promise<Partial<T> & Record<string, unknown>>
  ): void
}
const spyMethods = new Set([
  'fn',
  'spyOn',
  'isMockFunction',
  'clearAllMocks',
  'resetAllMocks',
  'restoreAllMocks',
])
const utilityMethods = new Set([
  'stubGlobal',
  'stubEnv',
  'unstubAllGlobals',
  'unstubAllEnvs',
  'useFakeTimers',
  'useRealTimers',
  'isFakeTimers',
  'clearAllTimers',
  'getTimerCount',
  'getMockedSystemTime',
  'getRealSystemTime',
  'setSystemTime',
  'advanceTimersByTime',
  'advanceTimersByTimeAsync',
  'advanceTimersToNextTimer',
  'advanceTimersToNextTimerAsync',
  'runOnlyPendingTimers',
  'runOnlyPendingTimersAsync',
  'runAllTimers',
  'runAllTimersAsync',
])
const spyCalls = new Map<string, Function>()
export const vi = new Proxy({} as SpyApi & UtilityApi & StaticMockApi, {
  get(_target, key) {
    if (typeof key === 'string' && spyMethods.has(key)) {
      getAssertionRuntime()
      let method = spyCalls.get(key)
      if (!method) {
        method = (...args: unknown[]) =>
          Reflect.apply(
            Reflect.get(getAssertionRuntime().spies, key),
            undefined,
            args
          )
        spyCalls.set(key, method)
      }
      return method
    }
    if (typeof key === 'string' && utilityMethods.has(key)) {
      getAssertionRuntime()
      let method = spyCalls.get(key)
      if (!method) {
        method = (...args: unknown[]) =>
          Reflect.apply(
            Reflect.get(getAssertionRuntime().utilities, key),
            undefined,
            args
          )
        spyCalls.set(key, method)
      }
      return method
    }
    return unsupported(`vi.${String(key)}`)
  },
})
export const vitest = vi
export const aroundEach = () => unsupported('aroundEach')
export const aroundAll = () => unsupported('aroundAll')
export function onTestFailed(handler: TestBody, timeout?: number) {
  const context = getActiveAttempt()
  if (!context) throw new Error('onTestFailed requires an active test.')
  context.onTestFailed(handler, timeout)
}
export const assertType = () => unsupported('assertType')
export const expectTypeOf = () => unsupported('expectTypeOf')
