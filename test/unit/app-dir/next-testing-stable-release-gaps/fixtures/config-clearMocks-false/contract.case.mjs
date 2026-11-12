import { test, expect, vi } from 'vitest'
const fn = vi.fn(() => 42)
test('first case creates call history', () => {
  expect(fn()).toBe(42)
  expect(fn).toHaveBeenCalledTimes(1)
})
test('clearMocks false preserves prior calls', () => {
  expect(fn).toHaveBeenCalledTimes(1)
  expect(fn()).toBe(42)
})
test('the preserved history remains file owned', () => {
  expect(fn).toHaveBeenCalledTimes(2)
})
