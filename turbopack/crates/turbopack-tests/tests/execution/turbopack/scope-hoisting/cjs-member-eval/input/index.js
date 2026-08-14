'use strict'

// `require(...).greet(...)` is not hoistable: the require sits under a member
// expression, so `./util` stays a runtime module reference.
const msg = require('./util').greet('world')

// A bare evaluation-only require is hoistable, so `./side` is merged in.
require('./side')

// This module needs a statically analyzable CommonJS export of its own, otherwise
// it is not mergeable and no scope-hoisting group forms around it.
exports.message = msg

it('supports member access on a require and bare evaluation requires', () => {
  expect(msg).toBe('hi world')
  expect(globalThis.__cjsSideEffectRan).toBe(1)
})
