const fs = require('node:fs')
const path = require('node:path')

// Read once when the loader module loads (cached in the worker), but reported as a dependency on
// every invocation.
const file = path.join(__dirname, 'data.txt')
const value = fs.readFileSync(file, 'utf8').trim()

module.exports = function () {
  this.addDependency(file)
  return `export default ${JSON.stringify(value)}`
}
