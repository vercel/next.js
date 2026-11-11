import { test, expect, vi } from 'vitest'
test('project loop limit controls infinite timer draining', () => {
  vi.useFakeTimers()
  try {
    setInterval(() => {}, 1)
    expect(() => vi.runAllTimers()).toThrow(/running 3 timers/)
  } finally {
    vi.useRealTimers()
  }
})
