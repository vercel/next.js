import { test, expect, vi } from 'vitest'
const fn = vi.fn(() => 42)
test('first', () => {
  expect(fn()).toBe(42)
  expect(fn).toHaveBeenCalledOnce()
})
test('second starts cleared', () => {
  expect(fn).not.toHaveBeenCalled()
  expect(fn()).toBe(42)
})
