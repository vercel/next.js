const path = require('node:path')

const loader = async function (content) {
  this.async()

  if (!this.resourcePath.endsWith('file-to-transform.ts')) {
    return this.callback(null, content)
  }

  const dependencyFile = './file-dependency.ts'
  const context = path.dirname(this.resourcePath)
  const resolve = this.getResolve({})
  const result = await resolve(context, dependencyFile)
  this.addDependency(result)

  this.callback(
    null,
    `export const utilFn = () => 'Generated at ${new Date().toISOString()}';`
  )
}

module.exports = loader
