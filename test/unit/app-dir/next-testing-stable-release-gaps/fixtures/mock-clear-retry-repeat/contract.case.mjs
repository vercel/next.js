import { test, expect, vi } from 'vitest'
const fn = vi.fn(() => 42)
test(
  'each retry and repeat has fresh calls',
  { retry: 1, repeats: 1 },
  ({ task }) => {
    expect(fn).not.toHaveBeenCalled()
    expect(fn()).toBe(42)
    if (task.result.retryCount === 0) throw new Error('retry each repeat')
  }
)
