const lodash = require('lodash')

exports.legacyLabel = function legacyLabel(value) {
  return lodash.toUpper(lodash.trim(value))
}
