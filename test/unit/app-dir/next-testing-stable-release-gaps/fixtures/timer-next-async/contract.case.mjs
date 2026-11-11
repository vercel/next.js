import { test, expect, vi } from 'vitest'
test('next async tick reaches promise-created timer in later tick', async () => {
  vi.useFakeTimers()
  const seen = []
  setTimeout(async () => {
    seen.push('first')
    await Promise.resolve()
    setTimeout(() => seen.push('second'), 2)
  }, 1)
  await vi.advanceTimersToNextTimerAsync()
  expect(seen).toEqual(['first'])
  expect(vi.getTimerCount()).toBe(1)
  await vi.advanceTimersToNextTimerAsync()
  expect(seen).toEqual(['first', 'second'])
  vi.useRealTimers()
})
