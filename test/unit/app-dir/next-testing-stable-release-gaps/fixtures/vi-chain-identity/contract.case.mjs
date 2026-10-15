import { test, expect, vi } from 'vitest'
test('reset and utility methods retain the facade identity', async () => {
  const subject = { method: () => 42 }
  vi.spyOn(subject, 'method').mockReturnValue(99)
  expect(vi.clearAllMocks()).toBe(vi)
  expect(vi.resetAllMocks()).toBe(vi)
  expect(vi.restoreAllMocks()).toBe(vi)
  expect(subject.method()).toBe(42)
  try {
    expect(vi.stubGlobal('releaseChainValue', 42)).toBe(vi)
    expect(vi.stubEnv('RELEASE_CHAIN_VALUE', '42')).toBe(vi)
    expect(vi.useFakeTimers().setSystemTime(42)).toBe(vi)
    expect(await vi.advanceTimersByTimeAsync(10)).toBe(vi)
    expect(Date.now()).toBe(52)
    expect(await vi.runAllTimersAsync()).toBe(vi)
    expect(vi.clearAllTimers()).toBe(vi)
    expect(vi.useRealTimers()).toBe(vi)
    expect(vi.unstubAllGlobals()).toBe(vi)
    expect(vi.unstubAllEnvs()).toBe(vi)
  } finally {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  }
})
