import { strictA } from './strict-a.js'
import { strictB } from './strict-b.js'

// With debug IDs, the `_debugIds` snippet must not come before the file-level `"use strict"` directive.
it('keeps the factories of an all-strict chunk strict', () => {
  expect(strictA).toBe(undefined)
  expect(strictB).toBe(undefined)
})
