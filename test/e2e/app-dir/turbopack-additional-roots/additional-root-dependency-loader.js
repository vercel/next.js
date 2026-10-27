const fs = require('node:fs')
const path = require('node:path')

module.exports = async function (source) {
  const linkedPackage = fs.realpathSync(path.join(this.rootContext, 'linked'))
  if (source.includes('unprocessed-external')) {
    const expectedPath = path.join(linkedPackage, 'input.loader.js')
    if (this.resourcePath !== expectedPath) {
      throw new Error(`Expected ${expectedPath}, got ${this.resourcePath}`)
    }
    if (this.resourceQuery !== '?external-root') {
      throw new Error(
        `Expected external resource query, got ${this.resourceQuery}`
      )
    }
  }
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
