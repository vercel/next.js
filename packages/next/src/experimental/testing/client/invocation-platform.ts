import type { AttemptContext } from '../runner/lifecycle'
import type { TestContext } from '../runner/collector'
import {
  invokeSynchronousAttempt,
  assertBrowserApiScope,
} from './async-context'
import { guardedExpect } from './api-scope'

export function invokeTestCallback(
  fn: Function,
  context: TestContext,
  owner: AttemptContext
) {
  const guarded = new Proxy(context, {
    get(target, key, receiver) {
      if (key === 'expect') return guardedExpect(target.expect)
      const value = Reflect.get(target, key, receiver)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        assertBrowserApiScope('utility')
        if (key !== 'inject' && key !== 'skip')
          throw new Error(
            'Browser Mode callback lifecycle and annotation APIs remain unsupported.'
          )
        return Reflect.apply(value, target, args)
      }
    },
  })
  return invokeSynchronousAttempt(owner, () => fn(guarded))
}
