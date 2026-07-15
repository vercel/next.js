'use strict'

const { add, PI } = require('./math')
const dep = require('./dep')

// This module needs a statically analyzable CommonJS export of its own, otherwise
// it is not mergeable and no scope-hoisting group forms around it.
const circumference = (r) => add(PI * r, PI * r)

exports.circumference = circumference

it('scope-hoists a static CJS require and preserves values', () => {
  expect(add(1, 2)).toBe(3)
  expect(PI).toBe(3.14)
  expect(circumference(1)).toBe(6.28)
})

it('scope-hoists a namespace require', () => {
  expect(dep.value).toBe(42)
  expect(dep.double(21)).toBe(42)
})
