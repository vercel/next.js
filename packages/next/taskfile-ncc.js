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
        // cannot bundle
        externals: ['chokidar'],
        ...options
      }
    ).then(({ code, assets }) => {
      Object.keys(assets).forEach((key) => this._.files.push({
        dir: join(file.dir, dirname(key)),
        base: basename(key),
        data: assets[key].source
      }))

      file.data = Buffer.from(code, 'utf8')
    })
  })
}
