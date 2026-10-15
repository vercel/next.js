import { test, expect, vi } from 'vitest'
test('waitUntil advances test timers and returns the truthy predicate value', async () => {
  vi.useFakeTimers()
  let ready = false
  setTimeout(() => {
    ready = true
  }, 20)
  expect(
    await vi.waitUntil(() => ready && 'ready', { interval: 5, timeout: 100 })
  ).toBe('ready')
  vi.useRealTimers()
})
