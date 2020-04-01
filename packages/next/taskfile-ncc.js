const ncc = require('@zeit/ncc')
const { existsSync, readFileSync } = require('fs')
const { basename, dirname, extname, join } = require('path')

module.exports = function(task) {
  // eslint-disable-next-line require-yield
  task.plugin('ncc', {}, function*(file, options) {
    if (options.externals && options.packageName) {
      options.externals = { ...options.externals }
      delete options.externals[options.packageName]
    }
    return ncc(join(__dirname, file.dir, file.base), {
      filename: file.base,
      minify: true,
      ...options,
    }).then(({ code, assets }) => {
      Object.keys(assets).forEach(key =>
        this._.files.push({
          dir: join(file.dir, dirname(key)),
          base: basename(key),
          data: assets[key].source,
        })
      )

      if (options && options.packageName) {
        writePackageManifest.call(this, options.packageName, file.base)
      }

      file.data = Buffer.from(code, 'utf8')
    })
  })
}

// This function writes a minimal `package.json` file for a compiled package.
// It defines `name`, `main`, `author`, and `license`. It also defines `types`.
// n.b. types intended for development usage only.
function writePackageManifest(packageName, main) {
  const packagePath = require.resolve(packageName + '/package.json')
  let { name, author, license } = require(packagePath)

  const compiledPackagePath = join(__dirname, `compiled/${packageName}`)

  const potentialLicensePath = join(dirname(packagePath), './LICENSE')
  if (existsSync(potentialLicensePath)) {
    this._.files.push({
      dir: compiledPackagePath,
      base: 'LICENSE',
      data: readFileSync(potentialLicensePath, 'utf8'),
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
          license ? { license } : undefined
        )
      ) + '\n',
  })
}
