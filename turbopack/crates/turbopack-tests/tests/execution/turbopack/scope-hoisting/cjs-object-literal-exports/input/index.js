'use strict'

const { greet, value } = require('./shorthand')
const { double, PI } = require('./keyvalue')

// This module needs a statically analyzable CommonJS export of its own, otherwise
// it is not mergeable and no scope-hoisting group forms around it.
exports.greeting = greet('world')

it('scope-hoists shorthand `module.exports = { … }` exports', () => {
  expect(typeof greet).toBe('function')
  expect(greet('world')).toBe('hi world')
  expect(value).toBe(42)
})

it('scope-hoists explicit key-value `module.exports = { … }` exports', () => {
  expect(typeof double).toBe('function')
  expect(double(21)).toBe(42)
  expect(PI).toBe(3.14)
})
