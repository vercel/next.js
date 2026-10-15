import { test, expect, vi } from 'vitest'
test('fake queueMicrotask and tick draining', () => {
  vi.useFakeTimers({ toFake: ['queueMicrotask'] })
  const seen = []
  queueMicrotask(() => seen.push('tick'))
  expect(seen).toEqual([])
  vi.runAllTicks()
  expect(seen).toEqual(['tick'])
  vi.useRealTimers()
})
