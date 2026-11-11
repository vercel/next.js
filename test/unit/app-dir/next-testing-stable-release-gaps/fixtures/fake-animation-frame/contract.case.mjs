import { test, expect, vi } from 'vitest'
test('frame timer advances independently', () => {
  vi.useFakeTimers()
  const fn = vi.fn()
  requestAnimationFrame(fn)
  vi.advanceTimersToNextFrame()
  expect(fn).toHaveBeenCalledOnce()
  vi.useRealTimers()
})
