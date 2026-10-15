import { test, expect } from 'vitest'
import { choose } from './subject.mjs'
test('production original source', () => {
  expect(choose(true)).toBe('yes')
  expect(choose(false)).toBe('no')
})
