const path = require('node:path')
const fs = require('node:fs')

const loader = async function (content) {
  this.async()

  if (this.resourcePath.endsWith('unsupported-build-dependency.ts')) {
    this.addBuildDependency(path.join(__dirname, 'cyclic-build-dependency'))
    this.addBuildDependency(
      `${path.join(__dirname, 'utils', 'build-dependency.js')}${path.sep}`
    )
    return this.callback(
      null,
      `export const utilFn = () => 'unsupported build dependency';`
    )
  }

  const resourceName = path.basename(this.resourcePath)
  if (resourceName === 'native-build-dependency.ts') {
    // Model a native addon already loaded by Node outside the project's watched roots.
    const { Module } = require('node:module')
    const filename = process.env.NATIVE_BUILD_DEPENDENCY
    const nativeModule = new Module(filename, module)
    nativeModule.filename = filename
    nativeModule.loaded = true
    require.cache[filename] = nativeModule
    return this.callback(
      null,
      `export const utilFn = () => ${JSON.stringify(fs.readFileSync(filename, 'utf8'))};`
    )
  }
  if (resourceName === 'dynamic-build-dependency.ts') {
    const dependency = process.env.DYNAMIC_BUILD_DEPENDENCY
    this.addBuildDependency(require.resolve(dependency))
    const value = require(dependency)
    return this.callback(
      null,
      `export const utilFn = () => ${JSON.stringify(`dynamic: ${value}`)};`
    )
  }
  if (resourceName === 'tracking-build-dependency.ts') {
    const cached = require('./tracking/cached')
    this.addBuildDependency(path.join(__dirname, 'tracking', 'uncached.mjs'))
    const uncached = fs
      .readFileSync(
        path.join(__dirname, 'tracking', 'uncached-value.js'),
        'utf8'
      )
      .match(/'([^']+)'/)[1]
    return this.callback(
      null,
      `export const utilFn = () => ${JSON.stringify(`${cached}; uncached: ${uncached}`)};`
    )
  }
  if (resourceName === 'unresolved-build-dependency.ts') {
    this.addBuildDependency('missing-build-dependency-package/')
    this.addBuildDependency('missing-build-dependency-module')
    return this.callback(
      null,
      "export const utilFn = () => 'unresolved dependency warning';"
    )
  }
  const directoryBuildDependency =
    resourceName === 'directory-build-dependency.ts'
  const packageDirectoryBuildDependency =
    resourceName === 'package-directory-build-dependency.ts'
  if (directoryBuildDependency) {
    const packageDirectory = path.join(__dirname, 'build-dependency-package')
    const nestedEntry = path.join(packageDirectory, 'nested', 'value.js')
    const directoryMarker = path.sep === '/' ? '\\' : '/'
    this.addBuildDependency(`${packageDirectory}${directoryMarker}`)
    const packageValue = fs
      .readFileSync(nestedEntry, 'utf8')
      .match(/'([^']+)'/)[1]
    return this.callback(
      null,
      `export const utilFn = () => 'directory build dependency: ${packageValue}';`
    )
  }

  if (this.resourcePath.endsWith('package-build-dependency.ts')) {
    const packageEntry = require.resolve('build-dependency-package')
    this.addBuildDependency('build-dependency-package')
    const packageValue = fs
      .readFileSync(packageEntry, 'utf8')
      .match(/'([^']+)'/)[1]
    return this.callback(
      null,
      `export const utilFn = () => 'package build dependency: ${packageValue}, generated at ${new Date().toISOString()}';`
    )
  }

  if (this.resourcePath.endsWith('esm-build-dependency.ts')) {
    const packageEntry = path.join(
      __dirname,
      'node_modules',
      'build-dependency-esm-package',
      'import.mjs'
    )
    this.addBuildDependency('build-dependency-esm-package/conditional.mjs')
    const packageValue = fs
      .readFileSync(packageEntry, 'utf8')
      .match(/'([^']+)'/)[1]
    return this.callback(
      null,
      `export const utilFn = () => 'ESM build dependency: ${packageValue}, generated at ${new Date().toISOString()}';`
    )
  }

  if (packageDirectoryBuildDependency) {
    this.addBuildDependency('directory-only-package/')
    const value = fs
      .readFileSync(
        path.join(
          __dirname,
          'node_modules',
          'directory-only-package',
          'data.txt'
        ),
        'utf8'
      )
      .trim()
    return this.callback(
      null,
      `export const utilFn = () => 'package directory build dependency: ${value}';`
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
