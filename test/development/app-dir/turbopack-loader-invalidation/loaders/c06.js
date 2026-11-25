// A dynamic require with a partially static path.
const name = ['c06', 'dep'].join('-')
const { value } = require('./dyn/' + name + '.js')

module.exports = function () {
  return `export default ${JSON.stringify(value)}`
}
