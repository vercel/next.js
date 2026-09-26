const path = require('node:path')
const fs = require('node:fs')

const loader = async function (content) {
  this.async()

  if (this.resourcePath.endsWith('unsupported-build-dependency.ts')) {
    this.addBuildDependency(path.join(__dirname, 'utils'))
    return this.callback(
      null,
      `export const utilFn = () => 'unsupported build dependency';`
    )
  }

  if (!this.resourcePath.endsWith('file-to-transform.ts')) {
    return this.callback(null, content)
  }

  const dependencyFile = './file-dependency.ts'
  const context = path.dirname(this.resourcePath)
  const resolve = this.getResolve({})
  const result = await resolve(context, dependencyFile)
  this.addDependency(result)
  const missingDependency = path.join(context, 'missing-dependency.ts')
  this.addMissingDependency(missingDependency)
  const buildDependency = path.join(context, 'build-dependency.js')
  this.addBuildDependency(buildDependency)
  const buildDependencyValue = fs
    .readFileSync(buildDependency, 'utf8')
    .match(/'([^']+)'/)[1]

  this.callback(
    null,
    `export const utilFn = () => 'Generated at ${new Date().toISOString()}, missing dependency: ${fs.existsSync(missingDependency)}, build dependency: ${buildDependencyValue}';`
  )
}

module.exports = loader
