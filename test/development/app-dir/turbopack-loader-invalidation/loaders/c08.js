const fs = require('node:fs')
const path = require('node:path')

module.exports = function () {
  const file = path.join(__dirname, 'c08-data.txt')
  this.addDependency(file)
  const value = fs.readFileSync(file, 'utf8').trim()
  return `export default ${JSON.stringify(value)}`
}
