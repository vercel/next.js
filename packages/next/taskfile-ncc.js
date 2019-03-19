'use strict'

const ncc = require('@zeit/ncc')
const { existsSync, readFileSync } = require('fs')
const { basename, dirname, extname, join, relative } = require('path')

module.exports = function (task) {
  task.plugin('ncc', {}, function * (file, options) {
    return ncc(join(__dirname, file.dir, file.base), {
      // cannot bundle
      externals: ['chokidar'],
      ...options
    }).then(({ code, assets }) => {
      Object.keys(assets).forEach(key =>
        this._.files.push({
          dir: join(file.dir, dirname(key)),
          base: basename(key),
          data: assets[key].source
        })
      )

      if (options && options.packageName) {
        writePackageManifest.call(this, options.packageName)
      }

      file.data = Buffer.from(code, 'utf8')
    })
  })
}

// This function writes a minimal `package.json` file for a compiled package.
// It defines `name`, `main`, `author`, and `license`. It also defines `types`.
// n.b. types intended for development usage only.
function writePackageManifest (packageName) {
  const packagePath = require.resolve(packageName + '/package.json')
  let { name, main, author, license, types, typings } = require(packagePath)
  if (!main) {
    main = 'index.js'
  }

  let typesFile = types || typings
  if (typesFile) {
    typesFile = require.resolve(join(packageName, typesFile))
  }

  const compiledPackagePath = join(__dirname, `dist/compiled/${packageName}`)

  const potentialLicensePath = join(dirname(packagePath), './LICENSE')
  if (existsSync(potentialLicensePath)) {
    this._.files.push({
      dir: compiledPackagePath,
      base: 'LICENSE',
      data: readFileSync(potentialLicensePath, 'utf8')
    })
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
          license ? { license } : undefined,
          typesFile
            ? {
              types: relative(compiledPackagePath, typesFile)
            }
            : undefined
        )
      ) + '\n'
  })
}
