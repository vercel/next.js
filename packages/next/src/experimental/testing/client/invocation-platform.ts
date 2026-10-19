import type { AttemptContext } from '../runner/lifecycle'
import type { TestContext } from '../runner/collector'
import { invokeClientAttempt, assertBrowserApiScope } from './async-context'
import { guardedExpect } from './api-scope'

const contexts = new WeakMap<TestContext, TestContext>()
const expectations = new WeakMap<TestContext['expect'], TestContext['expect']>()

function guardedContext(context: TestContext): TestContext {
  const cached = contexts.get(context)
  if (cached) return cached
  const guarded = new Proxy(context, {
    get(target, key, receiver) {
      if (key === 'expect') {
        const actual = target.expect
        let selected = expectations.get(actual)
        if (!selected) {
          selected = guardedExpect(actual)
          expectations.set(actual, selected)
        }
        return selected
      }
      const value = Reflect.get(target, key, receiver)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        assertBrowserApiScope('utility')
        if (
          ![
            'inject',
            'skip',
            'onTestFinished',
            'onTestFailed',
            'onCleanup',
          ].includes(String(key))
        )
          throw new Error(
            'Browser Mode callback lifecycle and annotation APIs remain unsupported.'
          )
        return Reflect.apply(value, target, args)
      }
    },
  })
  contexts.set(context, guarded)
  contexts.set(guarded, guarded)
  return guarded
}

export function getPublicTestContext<T extends TestContext>(context: T): T {
  return guardedContext(context) as T
}

export function invokeTestCallback(
  fn: Function,
  context: TestContext,
  owner: AttemptContext
) {
  return invokeClientAttempt(owner, () => fn(guardedContext(context)))
}

/** Consume results while the suite hook's bound invocation is active.
 * Ordinary assertion returns must not escape into later framework Promise resolution.
 * Real async results are awaited; beforeAll retains its existing setup cleanups.
 */
export async function settleSuiteHookResult(
  value: unknown,
  beforeAll: boolean
) {
  const result = await value
  return beforeAll && (typeof result === 'function' || Array.isArray(result))
    ? result
    : undefined
}

export function loadGlobalTestApi() {
  return import('./vitest')
}
