import { test, expect } from 'vitest'
import { choose } from './subject.ts'
test('typed original source', () => {
  expect(choose({ flag: true })).toBe('yes')
  expect(choose({ flag: false })).toBe('no')
})
