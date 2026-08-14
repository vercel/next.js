'use strict'

const base = 21

module.exports.value = 42
module.exports.double = (n) => n * 2

// A reserved word as an export name: the merged scope renames it to a `_default`
// local, so the name stays valid as a binding.
module.exports.default = 'the-default'
