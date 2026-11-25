const { value } = require('./c03-a.js')

module.exports = function () {
  return `export default ${JSON.stringify(value)}`
}
