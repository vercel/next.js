'use strict'

// `./shared` is required by `./a`, by `./b` and here, but its body must only be
// inlined once, at the point of the first require.
const { tag } = require('./shared')
const a = require('./a')
const b = require('./b')

exports.names = [tag, a.name, b.name]
