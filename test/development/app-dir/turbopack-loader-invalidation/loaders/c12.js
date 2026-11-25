// Resolves to `c12-res/index.js` until a `c12-res.js` file is created next to it.
const { value } = require('./c12-res')

module.exports = function () {
  return `export default ${JSON.stringify(value)}`
}
