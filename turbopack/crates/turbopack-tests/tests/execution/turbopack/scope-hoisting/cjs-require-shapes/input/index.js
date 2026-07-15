'use strict'

const { add, PI } = require('./math')
const dep = require('./dep')

// `require(...).greet(...)` is not hoistable: the require sits under a member
// expression, so `./util` stays a runtime module reference.
const msg = require('./util').greet('world')

// A bare evaluation-only require is hoistable, so `./side` is merged in.
require('./side')

// This module needs a statically analyzable CommonJS export of its own, otherwise
// it is not mergeable and no scope-hoisting group forms around it.
const circumference = (r) => add(PI * r, PI * r)

exports.circumference = circumference

it('scope-hoists a named require and preserves values', () => {
  expect(add(1, 2)).toBe(3)
  expect(PI).toBe(3.14)
  expect(circumference(1)).toBe(6.28)
})

it('scope-hoists a namespace require', () => {
  expect(dep.value).toBe(42)
  expect(dep.double(21)).toBe(42)
})

it('scope-hoists a reserved-word export name', () => {
  expect(dep.default).toBe('the-default')
})

it('supports member access on a require and bare evaluation requires', () => {
  expect(msg).toBe('hi world')
  expect(globalThis.__cjsSideEffectRan).toBe(1)
})
