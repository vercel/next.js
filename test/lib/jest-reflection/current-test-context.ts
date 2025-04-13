import { TEST_CONTEXT_SYMBOL, TestSuiteContext } from './shared'

/** Get information about the currently executing test.
 * (injected by a custom test environment)
 */
export function getCurrentTestContext(): TestSuiteContext {
  const _globalThis = globalThis as typeof globalThis & {
    [TEST_CONTEXT_SYMBOL]?: TestSuiteContext | null
  }
  const context = _globalThis[TEST_CONTEXT_SYMBOL]
  if (!context) {
    throw new Error('Expected test context to be set up')
  }
  return context
}
