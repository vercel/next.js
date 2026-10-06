// One binding, reached directly and through a re-exporting module under several names.
import { binding } from './module.js'
import { binding as binding3, binding2 } from './reexport.js'
import * as reexports from './reexport.js'

it('reads the same value through every name', () => {
  expect([binding, binding2, binding3]).toEqual([123, 123, 123])
  expect([reexports.binding, reexports.binding2]).toEqual([123, 123])
})
