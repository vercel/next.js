const { toUpper, trim } = require('lodash')

exports.legacyLabel = function legacyLabel(value) {
  return toUpper(trim(value))
}
