import { test, expect, vi } from 'vitest'
import { fn } from './subject.mjs'
vi.mock('./subject.mjs', { spy: true })
test('RSC graph honors ESM spy registration', () => {
  expect(fn()).toBe(42)
  expect(fn).toHaveBeenCalledOnce()
})
