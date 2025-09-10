const supportsES6 = require('../../../helpers/supportsES6')
const supportDefaultAssignment = require('../../../helpers/supportDefaultAssignment')
const supportsObjectDestructuring = require('../../../helpers/supportsObjectDestructuring')
const supportsIteratorDestructuring = require('../../../helpers/supportsIteratorDestructuring')

module.exports = function (config) {
  return (
    !config.minimize &&
    supportsES6() &&
    supportDefaultAssignment() &&
    supportsObjectDestructuring() &&
    supportsIteratorDestructuring()
  )
}
