exports.early = 'a-early'

const b = require('./b')

exports.fromB = b.seen
exports.late = 'a-late'
