import { test, expect, vi } from 'vitest'
test('pending timer snapshot includes promise work without draining newly scheduled timers', async () => {
  vi.useFakeTimers()
  const seen = []
  setTimeout(async () => {
    seen.push('first')
    await Promise.resolve()
    seen.push('promise')
    setTimeout(() => seen.push('later'), 10)
  }, 1)
  await vi.runOnlyPendingTimersAsync()
  expect(seen).toEqual(['first', 'promise'])
  expect(vi.getTimerCount()).toBe(1)
  await vi.runAllTimersAsync()
  expect(seen).toEqual(['first', 'promise', 'later'])
  vi.useRealTimers()
})
