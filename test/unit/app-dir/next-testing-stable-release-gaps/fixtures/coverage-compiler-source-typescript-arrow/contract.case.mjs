import { test, expect } from 'vitest'
import { choose, double } from './subject.ts'
test('actual compiler full source TypeScript coverage', () => {
  expect(choose(true)).toBe('yes')
  expect(choose(false)).toBe('no')
  expect(double(3)).toBe(6)
})
