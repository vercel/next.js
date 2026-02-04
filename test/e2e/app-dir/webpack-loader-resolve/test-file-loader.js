const fs = require('fs')
const path = require('path')

module.exports = async function () {
  let params = new URLSearchParams(this.resourceQuery.slice(1))
  let file
  if (params.has('absolute')) {
    file = path.join(__dirname, params.get('absolute'))
  } else if (params.has('relative')) {
    file = './' + params.get('relative')
  } else {
    this.callback(null, "throw new Error('no file specified')")
    return
  }

  const resolve = this.getResolve({})
  const result = await resolve(__dirname, file)
  this.addDependency(result)

  return fs.readFileSync(result, 'utf8')
}
