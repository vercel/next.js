import { doMock, doUnmock } from './mocking/dynamic'
import { resetModules } from './mocking/module-cache'
import {
  getTestApi,
  getActiveAttempt,
  getAssertionRuntime,
  getProvidedValue,
} from './runner'
import type { TestExpect } from './assertions'
export type { TestContext, TestBody } from './runner/collector'
export type {
  Test,
  Suite,
  File,
  Task,
  TaskPopulated,
  TaskResult,
  TaskMeta,
  TestTags,
  TestTagDefinition,
  TestAnnotation,
  TestAttachment,
  TestArtifactBase,
  TestArtifactLocation,
  TestAnnotationLocation,
} from './runner/tasks'
export type TestAPI = TestDeclaration
export interface ProvidedContext {}
export function inject<Key extends keyof ProvidedContext & string>(
  key: Key
): ProvidedContext[Key] {
  return getProvidedValue(key) as ProvidedContext[Key]
}
export type {
  Matchers,
  TestExpect,
  TestAssertion,
  Assertion,
  AsymmetricMatchersContaining,
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
  type AroundEachBody,
  type AroundAllBody,
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

export function createExpect(task?: {
  id: string
  fullTestName?: string
}): TestExpect {
  return getAssertionRuntime().createExpect(task)
}

export function should(): ReturnType<
  ReturnType<typeof getAssertionRuntime>['should']
> {
  return getAssertionRuntime().should()
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
  'fn' | 'spyOn' | 'isMockFunction' | 'mockObject'
> & {
  clearAllMocks(): VitestUtils
  resetAllMocks(): VitestUtils
  restoreAllMocks(): VitestUtils
}
type BackendUtilities = ReturnType<typeof getAssertionRuntime>['utilities']
type UtilityApi = Pick<BackendUtilities, 'waitFor' | 'waitUntil'> & {
  [Key in keyof Omit<
    BackendUtilities,
    'dispose'
  >]: BackendUtilities[Key] extends (...args: infer Args) => infer Result
    ? (
        ...args: Args
      ) => Result extends BackendUtilities
        ? VitestUtils
        : Result extends Promise<BackendUtilities>
          ? Promise<VitestUtils>
          : Result
    : BackendUtilities[Key]
}
export type VitestUtils = SpyApi & UtilityApi & StaticMockApi
type StaticMockApi = {
  hoisted<T>(factory: () => T): T
  /** Compiler-owned literal request: resolved in the original spec's Next graph. */
  importActual<T = Record<string, unknown>>(path: string): Promise<T>
  /** Literal runtime registration stays at its original lexical call site. */
  doMock<T extends object = Record<string, unknown>>(
    path: string,
    factory: (
      importOriginal: () => Promise<T>
    ) => Partial<T> | Promise<Partial<T>>
  ): { [Symbol.dispose]?: () => void }
  doUnmock(path: string): void
  /** Clear compiler-owned actual module evaluations for future imports. */
  resetModules(): VitestUtils
  /**
   * Compiler-only: requires a literal path (or literal import()) and an inline
   * factory with statically named exports, or no factory for automocking.
   * Untransformed calls throw; graph
   * support is capability-gated.
   */
  mock<T extends object = Record<string, unknown>>(
    path: string | Promise<T>,
    options?: { spy?: boolean }
  ): void
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
  'mockObject',
  'spyOn',
  'isMockFunction',
  'clearAllMocks',
  'resetAllMocks',
  'restoreAllMocks',
])
export type { RuntimeOptions } from './assertions/utilities'

const utilityMethods = new Set([
  'dynamicImportSettled',
  'setConfig',
  'resetConfig',
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
  'runAllTicks',
  'waitFor',
  'waitUntil',
  'advanceTimersToNextFrame',
  'setTimerTickMode',
])
function hoisted<T>(factory: () => T): T {
  if (typeof factory !== 'function') {
    throw new TypeError(
      `"vi.hoisted" factory value must be function, received "${typeof factory}"`
    )
  }
  return factory()
}
const spyCalls = new Map<string, Function>()
export const vi: VitestUtils = new Proxy({} as VitestUtils, {
  get(_target, key) {
    // Promise-returning utilities resolve to this ordinary, non-thenable facade.
    if (key === 'then') return undefined
    if (key === 'hoisted') return hoisted
    if (key === 'doMock') return doMock
    if (key === 'doUnmock') return doUnmock
    if (key === 'resetModules')
      return () => {
        getAssertionRuntime()
        resetModules()
        return vi
      }
    if (key === 'importActual') {
      throw new Error(
        'vi.importActual requires a direct literal request in a supported Next-compiled test entry.'
      )
    }
    if (typeof key === 'string' && spyMethods.has(key)) {
      getAssertionRuntime()
      let method = spyCalls.get(key)
      if (!method) {
        method = (...args: unknown[]) => {
          const result = Reflect.apply(
            Reflect.get(getAssertionRuntime().spies, key),
            undefined,
            args
          )
          return key === 'clearAllMocks' ||
            key === 'resetAllMocks' ||
            key === 'restoreAllMocks'
            ? vi
            : result
        }
        spyCalls.set(key, method)
      }
      return method
    }
    if (typeof key === 'string' && utilityMethods.has(key)) {
      getAssertionRuntime()
      let method = spyCalls.get(key)
      if (!method) {
        method = (...args: unknown[]) => {
          const result = Reflect.apply(
            Reflect.get(getAssertionRuntime().utilities, key),
            undefined,
            args
          )
          if (
            key === 'dynamicImportSettled' ||
            key === 'setConfig' ||
            key === 'resetConfig' ||
            key === 'waitFor' ||
            key === 'waitUntil' ||
            key === 'isFakeTimers' ||
            key === 'getTimerCount' ||
            key === 'getMockedSystemTime' ||
            key === 'getRealSystemTime'
          )
            return result
          return key.endsWith('Async')
            ? Promise.resolve(result).then(() => vi)
            : vi
        }
        spyCalls.set(key, method)
      }
      return method
    }
    return unsupported(`vi.${String(key)}`)
  },
})
export const vitest = vi
export const aroundEach = (fn: AroundEachBody, timeout?: number) =>
  getTestApi().aroundEach(fn, timeout)
export const aroundAll = (fn: AroundAllBody, timeout?: number) =>
  getTestApi().aroundAll(fn, timeout)
export function onTestFailed(handler: TestBody, timeout?: number) {
  const context = getActiveAttempt()
  if (!context) throw new Error('onTestFailed requires an active test.')
  context.onTestFailed(handler, timeout)
}
// These are type assertions: TypeScript checks their generics. They neither
// inspect runtime values nor initialize another test/controller runtime.
export function assertType<T>(value: T): void {
  void value
}
export { expectTypeOf } from '../../compiled/next-test-primitives'
export type { ExpectTypeOf } from '../../compiled/next-test-primitives'

export const assert: ReturnType<typeof getAssertionRuntime>['assert'] =
  new Proxy(
    function (
      ...args: Parameters<ReturnType<typeof getAssertionRuntime>['assert']>
    ) {
      return Reflect.apply(getAssertionRuntime().assert, undefined, args)
    } as ReturnType<typeof getAssertionRuntime>['assert'],
    {
      get(_target, key) {
        const value = Reflect.get(getAssertionRuntime().assert, key)
        return typeof value === 'function'
          ? (...args: unknown[]) =>
              Reflect.apply(
                Reflect.get(getAssertionRuntime().assert, key),
                undefined,
                args
              )
          : value
      },
    }
  )

export type { TestError } from '../../compiled/next-test-primitives'
