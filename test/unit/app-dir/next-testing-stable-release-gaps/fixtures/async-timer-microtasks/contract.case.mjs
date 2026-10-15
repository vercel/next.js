import { test, expect, vi } from 'vitest'
test('async timer draining reaches timers scheduled after promises', async () => {
  vi.useFakeTimers()
  const seen = []
  setTimeout(async () => {
    seen.push('first')
    await Promise.resolve()
    setTimeout(() => seen.push('second'), 1)
  }, 1)
  await vi.runAllTimersAsync()
  expect(seen).toEqual(['first', 'second'])
  vi.useRealTimers()
})
