import { test, expect, vi } from 'vitest'
import { fn } from './subject.mjs'
vi.mock('./subject.mjs')
test('automatic ESM factory', () => {
  expect(vi.isMockFunction(fn)).toBe(true)
  expect(fn()).toBeUndefined()
})
