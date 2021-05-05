// eslint-disable-next-line import/no-extraneous-dependencies
const ncc = require('@vercel/ncc')
const { existsSync, readFileSync } = require('fs')
const { basename, dirname, extname, join, resolve } = require('path')
const { Module } = require('module')

// See taskfile.js bundleContext definition for explanation
const m = new Module(resolve(__dirname, 'bundles', '_'))
m.filename = m.id
m.paths = Module._nodeModulePaths(m.id)
const bundleRequire = m.require
bundleRequire.resolve = (request, options) =>
  Module._resolveFilename(request, m, false, options)

module.exports = function (task) {
  // eslint-disable-next-line require-yield
  task.plugin('ncc', {}, function* (file, options) {
    if (options.externals && options.packageName) {
      options.externals = { ...options.externals }
      delete options.externals[options.packageName]
    }
    let precompiled = options.precompiled !== false
    delete options.precompiled

    return ncc(join(__dirname, file.dir, file.base), {
      filename: file.base,
      minify: options.minify === false ? false : true,
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
          precompiled
        )
      }

      file.data = Buffer.from(code, 'utf8')
    })
  })
}

// This function writes a minimal `package.json` file for a compiled package.
// It defines `name`, `main`, `author`, and `license`. It also defines `types`.
// n.b. types intended for development usage only.
function writePackageManifest(packageName, main, bundleName, precompiled) {
  const packagePath = bundleRequire.resolve(packageName + '/package.json')
  let { name, author, license } = require(packagePath)

  const compiledPackagePath = join(
    __dirname,
    `${!precompiled ? 'dist/' : ''}compiled/${bundleName || packageName}`
  )

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

  this._.files.push({
    dir: compiledPackagePath,
    base: 'package.json',
    data:
      JSON.stringify(
        Object.assign(
          {},
          { name, main: `${basename(main, '.' + extname(main))}` },
          author ? { author } : undefined,
          license ? { license } : undefined
        )
      ) + '\n',
  })
}
