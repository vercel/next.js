import { createSnapshotHelpers } from './assertions/snapshot-helpers'
export type {
  DomainMatchResult,
  DomainSnapshotAdapter,
} from './assertions/snapshot-helpers'
export { recordArtifact } from './runner/artifacts'
import { defineHelper } from './assertions/define-helper'
import { when, isWhenChain, type WhenApi } from './assertions/when'
import {
  createChaiNamespace,
  getChaiNamespacePrototype,
} from './assertions/chai-namespace'
import { doMock, doUnmock } from './mocking/dynamic'
import { resetModules } from './mocking/module-cache'
import {
  getTestApi,
  getCurrentTest,
  getActiveAttempt,
  isPublicTaskSelectionEnabled,
  getAssertionRuntime,
  getAssertionRuntimeForAssertions,
  getProvidedValue,
  registerTestSuiteAlias,
} from './runner'
import type { TestExpect } from './assertions'
import type { spies } from '../../compiled/next-test-primitives'
import {
  registerPublishedTaskListener,
  type File,
  type Suite,
} from './runner/tasks'
export type {
  TestContext,
  TestBody,
  TestOptions,
  SuiteOptions,
  SuiteCollector,
  TaskCustomOptions,
  OnTestFinishedHandler,
  OnTestFailedHandler,
} from './runner/collector'
export type SuiteFactory<ExtraContext = object> = (
  test: TestDeclaration<ExtraContext & object>
) => void | PromiseLike<void>
export type TestFunction<ExtraContext = object> = (
  context: TestContext & ExtraContext
) => any
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
  TestArtifactRegistry,
  TestArtifact,
  TestAnnotationArtifact,
  BrowserTraceArtifact,
  FailureScreenshotArtifact,
  VisualRegressionArtifact,
  TestArtifactLocation,
  TestAnnotationLocation,
} from './runner/tasks'
export type TestAPI<ExtraContext extends object = {}> =
  TestDeclaration<ExtraContext>
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
  testDeclarationMembers,
  type TestDeclaration,
  type SuiteDeclaration,
  type TestBody,
  type TestContext,
  type OnTestFinishedHandler,
  type OnTestFailedHandler,
  type AroundEachBody,
  type AroundAllBody,
} from './runner/collector'

// Resolve on use: setup helpers and the spec must share the emitted runner instance.
function declaration(name: 'test' | 'describe'): any {
  const members = new Map<PropertyKey, unknown>()
  const declarationMembers =
    name === 'test'
      ? testDeclarationMembers
      : ['each', 'for', 'skipIf', 'runIf']
  let initialized = false
  const raw = function (
    this: unknown,
    _name: unknown,
    _optionsOrFn?: unknown,
    _optionsOrTest?: unknown
  ) {
    return Reflect.apply(getTestApi()[name].fn, this, Array.from(arguments))
  }
  Object.defineProperty(raw, 'name', {
    value: name === 'test' ? '' : 'suiteFn',
  })
  const target = function (...args: unknown[]) {
    return Reflect.apply(getTestApi()[name], undefined, args)
  }
  Object.defineProperty(target, 'fn', { value: raw })
  function member(key: PropertyKey) {
    const value = Reflect.get(getTestApi()[name], key)
    if (!members.has(key)) {
      members.set(
        key,
        key === 'describe' || key === 'suite'
          ? value
          : new Proxy(value, {
              apply(_target, receiver, args) {
                return Reflect.apply(
                  Reflect.get(getTestApi()[name], key),
                  receiver,
                  args
                )
              },
            })
      )
    }
    return members.get(key)
  }
  function initialize() {
    if (initialized) return
    for (const key of declarationMembers)
      Object.defineProperty(raw, key, {
        value: member(key),
        enumerable: true,
        configurable: true,
        writable: true,
      })
    initialized = true
  }
  return new Proxy(target, {
    get(declarationTarget, key, receiver) {
      if (key === 'fn') {
        initialize()
        // Read the current declaration too, retaining its originating scope guard.
        Reflect.get(getTestApi()[name], key)
        return Reflect.get(declarationTarget, key, receiver)
      }
      if (typeof key === 'string' && declarationMembers.includes(key))
        return member(key)
      return Reflect.get(getTestApi()[name], key)
    },
    getOwnPropertyDescriptor(declarationTarget, key) {
      if (key === 'fn') initialize()
      return Reflect.getOwnPropertyDescriptor(declarationTarget, key)
    },
  })
}

export const Snapshots = createSnapshotHelpers((method, state, args) =>
  getAssertionRuntimeForAssertions().callSnapshotHelper(method, state, args)
)

export const test: TestDeclaration = declaration('test')
export const it = test
export const describe: SuiteDeclaration = declaration('describe')
export const suite = describe
registerTestSuiteAlias(describe)
type TestHookBody<ExtraContext> = (
  context: TestContext & ExtraContext,
  suite: Readonly<Suite>
) => unknown
type SuiteHookBody<ExtraContext> = (
  context: ExtraContext,
  suite: Readonly<Suite | File>
) => unknown
export const beforeAll = <ExtraContext = object>(
  fn: SuiteHookBody<ExtraContext>,
  timeout?: number
) => getTestApi().beforeAll(fn as TestBody, timeout)
export const afterAll = <ExtraContext = object>(
  fn: SuiteHookBody<ExtraContext>,
  timeout?: number
) => getTestApi().afterAll(fn as TestBody, timeout)
export const beforeEach = <ExtraContext = object>(
  fn: TestHookBody<ExtraContext>,
  timeout?: number
) => getTestApi().beforeEach(fn as TestBody, timeout)
export const afterEach = <ExtraContext = object>(
  fn: TestHookBody<ExtraContext>,
  timeout?: number
) => getTestApi().afterEach(fn as TestBody, timeout)
export function onTestFinished(
  handler: OnTestFinishedHandler,
  timeout?: number
) {
  if (!isPublicTaskSelectionEnabled()) {
    const context = getActiveAttempt()
    if (!context) throw new Error('onTestFinished requires an active test.')
    return context.onTestFinished(handler, timeout)
  }
  const task = getCurrentTest()
  if (!task)
    throw new Error('Hook onTestFinished() can only be called inside a test')
  registerPublishedTaskListener(
    task,
    'onTestFinished',
    handler as TestBody,
    timeout
  )
}

export function createExpect(task?: {
  id: string
  fullTestName?: string
}): TestExpect {
  return getAssertionRuntimeForAssertions().createExpect(task)
}

export function should(): ReturnType<
  ReturnType<typeof getAssertionRuntime>['should']
> {
  return getAssertionRuntimeForAssertions().should(chai.Assertion.prototype)
}

const expectMethods = new Map<PropertyKey, Function>()
export const expect: TestExpect = new Proxy(
  function (actual: unknown, message?: string) {
    return getAssertionRuntimeForAssertions().expect(actual, message)
  } as TestExpect,
  {
    get(_target, key) {
      // Chai exposes the same assert function through expect.assert and the
      // named export. Resolve admission before returning that stable dispatcher.
      if (key === 'assert') {
        getAssertionRuntimeForAssertions()
        return assert
      }
      const value = Reflect.get(getAssertionRuntimeForAssertions().expect, key)
      if (value === undefined && typeof key === 'string')
        unsupported(`expect.${key}`)
      if (typeof value === 'function') {
        let method = expectMethods.get(key)
        if (!method) {
          method = (...args: unknown[]) => {
            const runtime = getAssertionRuntimeForAssertions()
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
  stubEnv<T extends string>(
    name: T,
    value: T extends 'DEV' | 'PROD' | 'SSR'
      ? boolean | undefined
      : string | undefined
  ): VitestUtils
  setTimerTickMode: ((mode: 'manual' | 'nextTimerAsync') => VitestUtils) &
    ((mode: 'interval', interval?: number) => VitestUtils)
} & {
  [Key in keyof Omit<
    BackendUtilities,
    'dispose' | 'stubEnv' | 'setTimerTickMode'
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
type MockedHelper = (<T>(item: T, deep?: false) => spies.MaybeMocked<T>) &
  (<T>(item: T, deep: true) => spies.MaybeMockedDeep<T>) &
  (<T>(
    item: T,
    options: { partial?: false; deep?: false }
  ) => spies.MaybeMocked<T>) &
  (<T>(
    item: T,
    options: { partial?: false; deep: true }
  ) => spies.MaybeMockedDeep<T>) &
  (<T>(
    item: T,
    options: { partial: true; deep?: false }
  ) => spies.MaybePartiallyMocked<T>) &
  (<T>(
    item: T,
    options: { partial: true; deep: true }
  ) => spies.MaybePartiallyMockedDeep<T>) &
  (<T>(item: T) => spies.MaybeMocked<T>)
export type VitestUtils = SpyApi &
  UtilityApi &
  StaticMockApi &
  WhenApi & {
    mocked: MockedHelper
    defineHelper: typeof defineHelper
  }
type StaticMockApi = {
  hoisted<T>(factory: () => T): T
  /** Compiler-owned literal request: resolved in the original spec's Next graph. */
  importActual<T = Record<string, unknown>>(path: string): Promise<T>
  importMock<T = Record<string, unknown>>(
    path: string
  ): Promise<spies.MaybeMockedDeep<T>>
  unmock(path: string): void
  unmock(module: Promise<unknown>): void
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
const mocked = {
  mocked(item: unknown) {
    return item
  },
}.mocked as MockedHelper
Object.defineProperty(mocked, 'name', {
  value: 'mocked',
  configurable: true,
})
const spyCalls = new Map<string, Function>()
export const vi: VitestUtils = new Proxy({} as VitestUtils, {
  get(_target, key) {
    // Promise-returning utilities resolve to this ordinary, non-thenable facade.
    if (key === 'then' || key === 'recordArtifact') return undefined
    if (key === 'mocked') return mocked
    if (key === 'defineHelper') return defineHelper
    if (key === 'when' || key === 'isWhenChain') {
      getAssertionRuntime()
      return key === 'when' ? when : isWhenChain
    }
    if (key === 'hoisted') return hoisted
    if (key === 'doMock') return doMock
    if (key === 'doUnmock') return doUnmock
    if (key === 'resetModules')
      return () => {
        getAssertionRuntime()
        resetModules()
        return vi
      }
    if (key === 'importActual' || key === 'importMock' || key === 'unmock') {
      throw new Error(
        `vi.${key} requires a direct literal request in a supported Next-compiled test entry.`
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
export const aroundEach = <ExtraContext = object>(
  fn: (
    runTest: () => Promise<void>,
    context: TestContext & ExtraContext,
    suite: Readonly<Suite>
  ) => unknown,
  timeout?: number
) => getTestApi().aroundEach(fn as AroundEachBody, timeout)
export const aroundAll = <ExtraContext = object>(
  fn: (
    runSuite: () => Promise<void>,
    context: ExtraContext,
    suite: Readonly<Suite | File>
  ) => unknown,
  timeout?: number
) => getTestApi().aroundAll(fn as AroundAllBody, timeout)
export function onTestFailed(handler: OnTestFailedHandler, timeout?: number) {
  if (!isPublicTaskSelectionEnabled()) {
    const context = getActiveAttempt()
    if (!context) throw new Error('onTestFailed requires an active test.')
    return context.onTestFailed(handler, timeout)
  }
  const task = getCurrentTest()
  if (!task)
    throw new Error('Hook onTestFailed() can only be called inside a test')
  registerPublishedTaskListener(
    task,
    'onTestFailed',
    handler as TestBody,
    timeout
  )
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
      return getAssertionRuntimeForAssertions().callChaiAssert(
        undefined,
        args,
        getChaiNamespacePrototype(chai)
      )
    } as ReturnType<typeof getAssertionRuntime>['assert'],
    {
      get(target, key) {
        // Keep the function prototype attached to the admitted dispatcher.
        if (key === 'prototype') {
          getAssertionRuntimeForAssertions()
          return Reflect.get(target, key)
        }
        const value = Reflect.get(
          getAssertionRuntimeForAssertions().assert,
          key
        )
        return typeof value === 'function'
          ? (...args: unknown[]) =>
              getAssertionRuntimeForAssertions().callChaiAssert(
                key,
                args,
                getChaiNamespacePrototype(chai)
              )
          : value
      },
    }
  )

export type { TestError } from '../../compiled/next-test-primitives'

export type {
  MockContext,
  MockResult,
  MockResultIncomplete,
  MockResultReturn,
  MockResultThrow,
  MockSettledResult,
  MockSettledResultFulfilled,
  MockSettledResultIncomplete,
  MockSettledResultRejected,
  Mocked,
  MockedClass,
  MockedFunction,
  MockedObject,
} from '../../compiled/next-test-primitives'

export const chai = createChaiNamespace(assert, should)

// Public custom-matcher result aliases from the pinned matcher primitives.
export type {
  AsyncExpectationResult as AsyncMatcherResult,
  ExpectationResult as MatcherResult,
  SyncExpectationResult as SyncMatcherResult,
} from '../../compiled/next-test-primitives'
