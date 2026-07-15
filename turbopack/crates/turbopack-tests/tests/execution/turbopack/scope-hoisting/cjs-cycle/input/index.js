'use strict'

const a = require('./a')
const b = require('./b')

// This module needs a statically analyzable CommonJS export of its own, otherwise
// it is not mergeable and no scope-hoisting group forms around it.
const names = [a.name, a.bName, b.name, b.aName]

exports.names = names

it('preserves CommonJS cycle semantics when scope-hoisted', () => {
  expect(a.name).toBe('a')
  expect(a.bName).toBe('b')
  // `b` saw `a` partially initialized, so it only picked up `a.name`.
  expect(b.name).toBe('b')
  expect(b.aName).toBe('a')
  expect(names).toEqual(['a', 'b', 'b', 'a'])
})
