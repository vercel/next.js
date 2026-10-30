import { strictA } from './strict-a.js'
import { strictB } from './strict-b.js'

// Unminified, with debug IDs: the factories of an all-strict chunk stay strict.
it('keeps the factories of an all-strict chunk strict', () => {
  expect(strictA).toBe(undefined)
  expect(strictB).toBe(undefined)
})
