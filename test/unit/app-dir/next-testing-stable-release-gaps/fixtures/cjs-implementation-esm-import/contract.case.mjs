import { test, expect, vi } from 'vitest'
import { fn } from './subject.cjs'
vi.mock('./subject.cjs', { spy: true })
test('ESM consumer can mock a CommonJS implementation', () => {
  expect(fn()).toBe(42)
  expect(fn).toHaveBeenCalledOnce()
})
