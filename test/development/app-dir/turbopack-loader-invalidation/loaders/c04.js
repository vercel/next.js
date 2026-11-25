const { value } = require('./c04-data.json')

module.exports = function () {
  return `export default ${JSON.stringify(value)}`
}
