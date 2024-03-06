// eslint-disable-next-line import/no-extraneous-dependencies
const findUp = require('find-up')
// eslint-disable-next-line import/no-extraneous-dependencies
const ncc = require('@vercel/ncc')
const { existsSync, readFileSync } = require('fs')
const { basename, dirname, extname, join, resolve } = require('path')
const { Module } = require('module')
const glob = require('glob')

// See taskfile.js bundleContext definition for explanation
const m = new Module(resolve(__dirname, 'bundles', '_'))
m.filename = m.id
m.paths = Module._nodeModulePaths(m.id)
const bundleRequire = m.require
bundleRequire.resolve = (request, options) =>
  Module._resolveFilename(request, m, false, options)

/**
 * @param {taskr.Task} task
 */
module.exports = function (task) {
  // eslint-disable-next-line require-yield
  task.plugin(
    'ncc',
    {},
    function* (
      file,
      /** @type {import("./types/taskr").NccOptions} */ options
    ) {
      if (options.externals && options.packageName) {
        options.externals = { ...options.externals }
        delete options.externals[options.packageName]
      }
      let precompiled = options.precompiled !== false
      delete options.precompiled

      return ncc(join(__dirname, file.dir, file.base), {
        filename: file.base,
        minify: options.minify !== false,
        assetBuilds: true,
        ...options,
      }).then(({ code, assets }) => {
        Object.keys(assets).forEach((key) => {
          let data = assets[key].source

          this._.files.push({
            data,
            base: basename(key),
            dir: join(file.dir, dirname(key)),
          })
        })

        if (options && options.packageName) {
          writePackageManifest.call(
            this,
            options.packageName,
            file.base,
            options.bundleName,
            precompiled,
            options.packageJsonName,
            options.types
          )
        }

        file.data = Buffer.from(code, 'utf8')
      })
    }
  )
}

/**
 * This function writes a minimal `package.json` file for a compiled package.
 * It defines `name`, `main`, `author`, and `license`. It also defines `types`.
 * n.b. types intended for development usage only.
 *
 * @this {import("./types/taskr").Task}
 * @param {string} packageName
 * @param {string} main
 * @param {string} [bundleName]
 * @param {boolean} precompiled
 * @param {string} [packageJsonName]
 * @param {boolean} [enableTypes]
 */
function writePackageManifest(
  packageName,
  main,
  bundleName,
  precompiled,
  packageJsonName,
  enableTypes
) {
  const compiledPackagePath = join(
    __dirname,
    `${!precompiled ? 'dist/' : ''}src/compiled/${bundleName || packageName}`
  )

  // some newer packages fail to include package.json in the exports
  // so we can't reliably use require.resolve here
  let packagePath
  try {
    packagePath = bundleRequire.resolve(packageName + '/package.json')
  } catch (_) {
    packagePath = findUp.sync('package.json', {
      cwd: dirname(bundleRequire.resolve(packageName)),
    })
  }
  let { name, author, license, version } = require(packagePath)

  const potentialLicensePath = join(dirname(packagePath), './LICENSE')
  if (existsSync(potentialLicensePath)) {
    this._.files.push({
      dir: compiledPackagePath,
      base: 'LICENSE',
      data: readFileSync(potentialLicensePath, 'utf8'),
    })
  } else {
    // license might be lower case and not able to be found on case-sensitive
    // file systems (ubuntu)
    const otherPotentialLicensePath = join(dirname(packagePath), './license')
    if (existsSync(otherPotentialLicensePath)) {
      this._.files.push({
        dir: compiledPackagePath,
        base: 'LICENSE',
        data: readFileSync(otherPotentialLicensePath, 'utf8'),
      })
    }
  }

  const types =
    enableTypes === false
      ? undefined
      : writeTypes.call(this, packageName, packagePath, compiledPackagePath)

  this._.files.push({
    dir: compiledPackagePath,
    base: 'package.json',
    data:
      JSON.stringify(
        Object.assign(
          {},
          {
            name: packageJsonName ?? name,
            main: `${basename(main, '.' + extname(main))}`,
            version,
          },
          author ? { author } : undefined,
          license ? { license } : undefined,
          types ? { types } : undefined
        ),
        null,
        2
      ) + '\n',
  })
}

/**
 * @this {import("./types/taskr").Task}
 * @param {string} packageName
 * @param {string} packagePath
 * @param {string} compiledPackagePath
 * @return {string | undefined}
 */
function writeTypes(packageName, packagePath, compiledPackagePath) {
  let typesPackagePath = packagePath
  let files = glob.sync('**/*.d.ts', { cwd: dirname(typesPackagePath) })

  let {
    main,
    types,
    typings,
  } = /** @type {{ main?: string, types?: string, typings?: string }} */ require(typesPackagePath)
  types = types ?? typings
  if (!types && main) {
    let maybeTypes = main.replace(/\.js$/, '.d.ts')
    let maybeTypesPath = join(dirname(typesPackagePath), maybeTypes)

    if (existsSync(maybeTypesPath)) {
      types = maybeTypes
    }
  }

  if (!types && files.length === 0) {
    let typesPackageName = `@types/${packageName
      .replace(/^@/, '')
      .replace(/\//g, '__')}`

    try {
      typesPackagePath = bundleRequire.resolve(
        typesPackageName + '/package.json'
      )
      files = glob.sync('**/*.d.ts', { cwd: dirname(typesPackagePath) })
      const pkg = require(typesPackagePath)
      types = pkg.types ?? pkg.typings
    } catch (e) {}
  }

  const typesPath = types ? join(dirname(typesPackagePath), types) : undefined
  if (typesPath && existsSync(typesPath)) {
    this._.files.push({
      dir: compiledPackagePath,
      base: types,
      data: readFileSync(typesPath, 'utf8'),
    })
  }

  for (const file of files) {
    const filePath = join(dirname(typesPackagePath), file)
    if (filePath !== typesPath && existsSync(filePath)) {
      this._.files.push({
        dir: compiledPackagePath,
        base: file,
        data: readFileSync(filePath, 'utf8'),
      })
    }
  }

  return types
}
