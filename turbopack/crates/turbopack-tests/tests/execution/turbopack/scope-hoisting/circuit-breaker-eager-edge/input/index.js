import { eagerA, readB, readEntry } from './eager-a.js'

export const entryValue = 'entry'

it('preserves an evaluation-time cycle', () => {
  expect(eagerA).toBe('a')
  expect(readB()).toBe('b')
  expect(readEntry()).toBe('entry')
})
