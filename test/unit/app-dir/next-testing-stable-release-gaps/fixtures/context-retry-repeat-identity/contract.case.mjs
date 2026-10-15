import { test, expect } from 'vitest'
let owner, expectation, signal
test(
  'context identities survive retries and repeats',
  { retry: 1, repeats: 1 },
  (ctx) => {
    if (!owner) {
      owner = ctx
      expectation = ctx.expect
      signal = ctx.signal
    } else {
      expect(ctx).toBe(owner)
      expect(ctx.expect).toBe(expectation)
      expect(ctx.signal).toBe(signal)
    }
    if (ctx.task.result.retryCount === 0) throw new Error('first attempt fails')
  }
)
