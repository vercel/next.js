const fs = require('node:fs')
const path = require('node:path')

module.exports = function (source) {
  const callback = this.async()
  const linkedPackage = fs.realpathSync(path.join(this.rootContext, 'linked'))
  const siblingRelative = '../../node_modules/sibling/index.js'
  const siblingAbsolute = path.resolve(linkedPackage, siblingRelative)

  this.addDependency(path.resolve(this.rootContext, 'next.config.js'))
  this.addDependency(siblingAbsolute)
  this.getResolve()(linkedPackage, siblingRelative, (err, resolved) => {
    if (err) return callback(err)
    if (resolved !== siblingAbsolute) {
      return callback(new Error(`Expected ${siblingAbsolute}, got ${resolved}`))
    }
    callback(null, source.replace('unprocessed', 'processed'))
  })
}
