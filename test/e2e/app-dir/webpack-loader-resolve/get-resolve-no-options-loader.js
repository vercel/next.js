const fs = require('fs')

module.exports = async function () {
  const resolve = this.getResolve()
  const result = await resolve(__dirname, './data2')
  this.addDependency(result)

  return fs.readFileSync(result, 'utf8')
}
