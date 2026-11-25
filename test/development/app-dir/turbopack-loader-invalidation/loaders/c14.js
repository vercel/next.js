const fs = require('node:fs')
const path = require('node:path')

// Read once at module load (cached in the worker), but still reported as a dependency.
const file = path.join(__dirname, 'c14-data.txt')
const value = fs.readFileSync(file, 'utf8').trim()

module.exports = function () {
  this.addDependency(file)
  return `export default ${JSON.stringify(value)}`
}
