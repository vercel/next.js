import { strictA } from './strict-a.js'
import { strictB } from './strict-b.js'

// A chunk whose module factories are all strict carries one file-level `"use strict"` directive.
it('keeps the factories of an all-strict chunk strict', () => {
  expect(strictA).toBe(undefined)
  expect(strictB).toBe(undefined)
})
