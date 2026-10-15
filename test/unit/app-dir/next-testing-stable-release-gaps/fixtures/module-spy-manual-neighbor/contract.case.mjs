import { test, expect, vi } from 'vitest'
import { fn } from './subject.mjs'
vi.mock('./subject.mjs', { spy: true })
test('spy preserves behavior and records invocation', () => {
  expect(fn()).toBe(42)
  expect(fn).toHaveBeenCalledOnce()
})
