var abc = {}

module.exports = abc

module.exports.abc = 'abc'
module.exports.def = 'def'

expect(abc).toEqual({ abc: 'abc', def: 'def' })
