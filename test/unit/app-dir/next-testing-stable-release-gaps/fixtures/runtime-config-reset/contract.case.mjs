import { test, expect, vi } from 'vitest'
test('runtime fake timer configuration reaches the actual clock', () => {
  vi.setConfig({ fakeTimers: { loopLimit: 2 } })
  vi.useFakeTimers()
  setInterval(() => {}, 1)
  expect(() => vi.runAllTimers()).toThrow(/after running 2 timers/)
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.resetConfig()
})
test('reset restores the original timer configuration', () => {
  vi.useFakeTimers()
  let ticks = 0
  const interval = setInterval(() => {
    if (++ticks === 3) clearInterval(interval)
  }, 1)
  vi.runAllTimers()
  expect(ticks).toBe(3)
  vi.useRealTimers()
})
