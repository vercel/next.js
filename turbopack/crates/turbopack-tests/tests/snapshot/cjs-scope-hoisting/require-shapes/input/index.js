'use strict'

// Destructured require: only `add` and `PI` are read.
const { add, PI } = require('./math')
// Namespace require: the whole exports object is bound.
const dep = require('./dep')
// Member call on the require result: not a top-level hoistable path, so this
// keeps a runtime require.
const greeting = require('./util').greet('world')

// Bare evaluation-only require: the statement is dropped and the body inlined.
require('./side')

exports.total = add(PI, dep.value)
exports.doubled = dep.double(21)
exports.message = greeting
