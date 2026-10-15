import type { AttemptContext } from './lifecycle'
import type { TestContext } from './collector'

/** The default runtime preserves native asynchronous scope propagation. */
export function invokeTestCallback(
  fn: Function,
  context: TestContext,
  _owner: AttemptContext
) {
  return fn(context)
}
