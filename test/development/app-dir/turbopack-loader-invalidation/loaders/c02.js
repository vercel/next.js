const { value } = require('./c02-dep.js')

module.exports = function () {
  return `export default ${JSON.stringify(value)}`
}
