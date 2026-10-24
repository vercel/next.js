import { strictA } from './strict-a.js'
import { strictB } from './strict-b.js'
import { strictC } from './strict-c.js'
import sloppy from './sloppy.js'

// A chunk that mixes strict (ESM) and sloppy (CommonJS) module factories must keep each factory's
// strictness through minification.
it('keeps strict factories strict in a minified mixed chunk', () => {
  expect(strictA).toBe(undefined)
  expect(strictB).toBe(undefined)
  expect(strictC).toBe(undefined)
})

it('keeps sloppy factories sloppy in a minified mixed chunk', () => {
  expect(sloppy).toBe(globalThis)
})
