import { expect, it } from 'vitest'
import { multiline, unusedMultiline } from './multiline'

it('keeps executed multiline expressions distinct from an unused body', () => {
  expect(typeof unusedMultiline).toBe('function')
  expect(multiline(2)).toBe('result:\n6\npositive\nend')
})
