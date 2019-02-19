'use strict'

const ncc = require('@zeit/ncc')
const basename = require('path').basename
const dirname = require('path').dirname
const join = require('path').join

module.exports = function (task) {
  task.plugin('ncc', {}, function * (file, options) {
    return ncc(
      join(__dirname, file.dir, file.base),
      {
        // we dont care about watching, so we don't want
        // to bundle it. even if we did want watching and a bigger
        // bundle, webpack (and therefore ncc) cannot currently bundle
        // chokidar, which is quite convenient
        externals: ['chokidar']
      }
    ).then(({ code, assets }) => {
      Object.keys(assets).forEach((key) => this._.files.push({
        dir: join(file.dir, dirname(key)),
        base: basename(key),
        data: assets[key].source
      }))

      if (file.base === 'webpack.js') file.base = 'index.js'
      file.data = Buffer.from(code, 'utf8')
    })
  })
}
