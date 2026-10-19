// This facade adds platform admission; declaration, execution and assertions still
// belong to the same compiler-bundled Next runner and pinned primitives.
import * as common from '../vitest'
import {
  getAssertionRuntime,
  getAssertionRuntimeForAssertions,
} from '../runner'
import {
  createChaiNamespace,
  getChaiNamespacePrototype,
} from '../assertions/chai-namespace'
import { guardedDeclaration, guardedExpect } from './api-scope'
import { assertBrowserApiScope } from './async-context'
import { elementExpect } from './browser-context'

export const test = guardedDeclaration(common.test)
export const it = test
export const describe = guardedDeclaration(common.describe)
export const suite = describe
export const expect = new Proxy(guardedExpect(common.expect), {
  get(target, key, receiver) {
    if (key === 'element') return elementExpect
    if (key === 'assert') return assert
    return Reflect.get(target, key, receiver)
  },
})
export const assert: typeof common.assert = guardedExpect(
  new Proxy(
    function (...args: Parameters<typeof common.assert>) {
      return getAssertionRuntimeForAssertions().callChaiAssert(
        undefined,
        args,
        getChaiNamespacePrototype(chai)
      )
    } as typeof common.assert,
    {
      get(target, key) {
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
)
export const createExpect = (
  ...args: Parameters<typeof common.createExpect>
) => {
  assertBrowserApiScope('assertion')
  return guardedExpect(common.createExpect(...args))
}
function unsupported(): never {
  assertBrowserApiScope('utility')
  throw new Error(
    'This API is not yet supported by the single-case development Browser Mode profile.'
  )
}
export const beforeAll = guardedDeclaration(common.beforeAll)
export const afterAll = guardedDeclaration(common.afterAll)
export const beforeEach = guardedDeclaration(common.beforeEach)
export const afterEach = guardedDeclaration(common.afterEach)
export const aroundAll = guardedDeclaration(common.aroundAll)
export const aroundEach = guardedDeclaration(common.aroundEach)
export const recordArtifact: typeof common.recordArtifact =
  common.recordArtifact
export const onTestFinished = common.onTestFinished
export const onTestFailed = common.onTestFailed
export const should: typeof common.should = guardedExpect(function should() {
  return getAssertionRuntimeForAssertions().should(chai.Assertion.prototype)
})
export const chai: typeof common.chai = createChaiNamespace(assert, should)
const waitViMethods = new Map<string, (...args: unknown[]) => unknown>()
const fluentViMethods = new Map<string, (...args: unknown[]) => unknown>()
const fluentViKeys = new Set([
  'stubGlobal',
  'unstubAllGlobals',
  'stubEnv',
  'unstubAllEnvs',
  'clearAllMocks',
  'resetAllMocks',
  'restoreAllMocks',
  'useFakeTimers',
  'useRealTimers',
  'clearAllTimers',
  'setSystemTime',
  'advanceTimersByTime',
  'advanceTimersByTimeAsync',
  'advanceTimersToNextTimer',
  'advanceTimersToNextTimerAsync',
  'advanceTimersToNextFrame',
  'runAllTicks',
  'setTimerTickMode',
  'runOnlyPendingTimers',
  'runOnlyPendingTimersAsync',
  'runAllTimers',
  'runAllTimersAsync',
])
export const vi = new Proxy({} as typeof common.vi, {
  get(_target, key) {
    if (key === 'then' || key === 'recordArtifact') return undefined
    if (key === 'mocked') return common.vi.mocked
    if (key === 'defineHelper') return common.vi.defineHelper
    assertBrowserApiScope('utility')
    if (key === 'waitFor' || key === 'waitUntil') {
      let method = waitViMethods.get(key)
      if (!method) {
        method = (...args: unknown[]) => {
          assertBrowserApiScope('utility')
          const waits = getAssertionRuntime().getRealTimerWaits()
          return Reflect.apply(waits[key], undefined, args)
        }
        waitViMethods.set(key, method)
      }
      return method
    }
    if (
      typeof key === 'string' &&
      [
        'fn',
        'spyOn',
        'mockObject',
        'isMockFunction',
        'clearAllMocks',
        'resetAllMocks',
        'restoreAllMocks',
        'stubGlobal',
        'unstubAllGlobals',
        'stubEnv',
        'unstubAllEnvs',
        'setConfig',
        'resetConfig',
        'dynamicImportSettled',
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
        'advanceTimersToNextFrame',
        'runAllTicks',
        'setTimerTickMode',
        'runOnlyPendingTimers',
        'runOnlyPendingTimersAsync',
        'runAllTimers',
        'runAllTimersAsync',
        'hoisted',
        'when',
        'isWhenChain',
      ].includes(key)
    ) {
      const method = Reflect.get(common.vi, key)
      if (!fluentViKeys.has(key)) return method
      let fluent = fluentViMethods.get(key)
      if (!fluent) {
        fluent = (...args: unknown[]) => {
          assertBrowserApiScope('utility')
          const result = Reflect.apply(method, common.vi, args)
          if (key.endsWith('Async'))
            return Promise.resolve(result).then((value) =>
              value === common.vi ? vi : value
            )
          return result === common.vi ? vi : result
        }
        fluentViMethods.set(key, fluent)
      }
      return fluent
    }
    return unsupported()
  },
})
export const vitest = vi
export const inject = common.inject
export const assertType = common.assertType
export const expectTypeOf = common.expectTypeOf
export type * from '../vitest'
