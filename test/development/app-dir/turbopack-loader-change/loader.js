// The prefix is read from a separate module, so that changing it requires the loader's Node.js
// worker to load the new code.
const { prefix } = require('./loader-prefix.js')

module.exports = function (content) {
  return `export default ${JSON.stringify(`${prefix}:${content.trim()}`)}`
}
