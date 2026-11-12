import { test, expect, vi } from 'vitest'
test('date-only mocking leaves real timers and real clock observable', async () => {
  const before = vi.getRealSystemTime()
  vi.setSystemTime(new Date('2026-01-02T03:04:05Z'))
  expect(vi.isFakeTimers()).toBe(false)
  expect(Date.now()).toBe(1767323045000)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(vi.getRealSystemTime()).toBeGreaterThanOrEqual(before)
  vi.useRealTimers()
  expect(Date.now()).toBeGreaterThanOrEqual(before)
})
