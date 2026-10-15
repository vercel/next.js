import { test, expect, vi } from 'vitest'
test('fake clock is explicitly file owned', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-02T03:04:05Z'))
  expect(Date.now()).toBe(1767323045000)
})
test('fake clock survives until explicit restoration', () => {
  expect(vi.isFakeTimers()).toBe(true)
  expect(Date.now()).toBe(1767323045000)
  vi.useRealTimers()
  expect(vi.isFakeTimers()).toBe(false)
})
