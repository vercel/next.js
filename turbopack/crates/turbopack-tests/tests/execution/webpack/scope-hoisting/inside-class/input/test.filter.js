const supportsES6 = require('../../../helpers/supportsES6')

module.exports = function (config) {
  return supportsES6()
}
