// `dead` is an unused require binding that shares its declaration with `keep`.
// Dropping the unused require must not delete the sibling `keep` declarator; the
// call is replaced in place (`const dead = 0, keep = 'kept'`).
const dead = require('./pure.js'),
  keep = 'kept'

exports.keep = keep
