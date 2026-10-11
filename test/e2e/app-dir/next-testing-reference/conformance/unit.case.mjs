import { expect, it } from 'vitest'
import { sum } from '../lib/subject.ts'

it('runs the ordinary application subject', () => {
  expect(sum([2, 3, 5])).toBe(10)
  expect(sum([])).toBe(0)
})
