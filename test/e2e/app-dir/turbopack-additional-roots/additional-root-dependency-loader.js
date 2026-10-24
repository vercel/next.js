const fs = require('node:fs')
const path = require('node:path')

module.exports = async function (source) {
  const linkedPackage = fs.realpathSync(path.join(this.rootContext, 'linked'))
  const siblingRelative = '../../node_modules/sibling/index.js'
  const siblingAbsolute = path.resolve(linkedPackage, siblingRelative)

  this.addDependency(path.resolve(this.rootContext, 'next.config.js'))
  this.addDependency(siblingAbsolute)
  const resolve = this.getResolve()
  const resolved = await resolve(linkedPackage, siblingRelative)
  if (resolved !== siblingAbsolute) {
    throw new Error(`Expected ${siblingAbsolute}, got ${resolved}`)
  }
  return source.replace('unprocessed', 'processed')
}
