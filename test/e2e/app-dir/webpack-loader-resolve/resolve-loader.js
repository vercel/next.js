const path = require('path')

module.exports = function () {
  const callback = this.async()

  this.resolve(this.context, './resolved-value.js', (err, result) => {
    if (err) return callback(err)
    callback(null, `export default ${JSON.stringify(path.basename(result))}`)
  })
}
