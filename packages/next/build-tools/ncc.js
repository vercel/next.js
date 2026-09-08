const findUp = require('find-up')
const ncc = require('@vercel/ncc')
const { existsSync, readFileSync } = require('fs')
const { basename, dirname, extname, join, resolve } = require('path')
const { Module } = require('module')
const root = resolve(__dirname, '..')

// files might be lower case and not able to be found on case-sensitive
// file systems (ubuntu)
const potentialLicenseFiles = [
  'LICENSE',
  'license',
  'LICENSE.md',
  'License.md',
  'license.md',
]

// See recipes.js bundleContext definition for explanation
const m = new Module(resolve(root, 'bundles', '_'))
m.filename = m.id
m.paths = Module._nodeModulePaths(m.id)
const bundleRequire = m.require
bundleRequire.resolve = (request, options) =>
  Module._resolveFilename(request, m, false, options)

module.exports = async function (file, options) {
  if (options.externals && options.packageName) {
    options.externals = { ...options.externals }
    delete options.externals[options.packageName]
  }
  let precompiled = options.precompiled !== false
  delete options.precompiled

  return ncc(join(root, file.dir, file.base), {
    filename: file.base,
    minify: options.minify === false ? false : true,
    assetBuilds: true,
    cache: false,
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
        options.packageJsonName
      )
    }

    file.data = Buffer.from(code, 'utf8')
  })
}

// This function writes a minimal `package.json` file for a compiled package.
// It defines `name`, `main`, `author`, and `license`. It also defines `types`.
// n.b. types intended for development usage only.
function writePackageManifest(
  packageName,
  main,
  bundleName,
  precompiled,
  packageJsonName
) {
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
  let { name, author, license } = require(packagePath)

  const compiledPackagePath = join(
    root,
    `${!precompiled ? 'dist/' : ''}src/compiled/${bundleName || packageName}`
  )

  for (const licenseFile of potentialLicenseFiles) {
    const potentialLicensePath = join(dirname(packagePath), licenseFile)
    if (existsSync(potentialLicensePath)) {
      this._.files.push({
        dir: compiledPackagePath,
        base: 'LICENSE',
        data: readFileSync(potentialLicensePath, 'utf8'),
      })
      break
    }
  }

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
          },
          author ? { author } : undefined,
          license ? { license } : undefined
        )
      ) + '\n',
  })
}
