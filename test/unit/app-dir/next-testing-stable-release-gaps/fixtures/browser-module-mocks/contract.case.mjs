import { test, expect, vi } from 'vitest'
import { fn } from './subject.mjs'
vi.mock('./subject.mjs', { spy: true })
test('client graph honors module mocks', () => {
  expect(fn()).toBe(42)
  expect(fn).toHaveBeenCalledOnce()
  expect(typeof document).toBe('object')
})
