import type { AttemptContext } from './lifecycle'
import type { TestContext } from './collector'

/** Node publishes the original context object used by all its callbacks. */
export function getPublicTestContext<T extends TestContext>(context: T): T {
  return context
}

/** The default runtime preserves native asynchronous scope propagation. */
export function invokeTestCallback(
  fn: Function,
  context: TestContext,
  _owner: AttemptContext
) {
  return fn(context)
}

/** Node's native async storage already carries hook result settlement. */
export function settleSuiteHookResult(value: unknown, _beforeAll: boolean) {
  return value
}

export function loadGlobalTestApi() {
  return import('../vitest')
}
