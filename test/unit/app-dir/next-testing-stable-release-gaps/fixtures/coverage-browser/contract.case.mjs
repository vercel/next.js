import { test, expect } from 'vitest'
import { choose } from './subject.mjs'
test('browser original source', () => {
  expect(typeof window).toBe('object')
  expect(choose(true)).toBe('yes')
  expect(choose(false)).toBe('no')
})
