'use strict'

const ncc = require('@zeit/ncc')
const { writeFileSync, existsSync, copyFileSync } = require('fs')
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

      file.data = Buffer.from(code, 'utf8')
    })
  })
}

// This function writes a minimal `package.json` file for a compiled package.
// It defines `name` and `main`. It also defines `types` (intended for
// development usage only).
module.exports.writePackageManifest = function writePackageManifest (
  packageName
) {
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
    copyFileSync(potentialLicensePath, join(compiledPackagePath, './LICENSE'))
  }

  writeFileSync(
    join(compiledPackagePath, './package.json'),
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
  )
}
