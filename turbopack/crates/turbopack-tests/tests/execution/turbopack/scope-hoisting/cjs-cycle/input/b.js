'use strict'

exports.name = 'b'

const a = require('./a')

// `a` is only partially initialized here (CommonJS cycle): `a.name` is set, but
// `a.bName` is not assigned until after this module finishes.
exports.aName = a.name
