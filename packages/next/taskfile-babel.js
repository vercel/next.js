// taskr babel plugin with Babel 7 support
// https://github.com/lukeed/taskr/pull/305
'use strict'

const transform = require('@babel/core').transform

module.exports = function (task) {
  task.plugin('babel', {}, function * (file, opts) {
    const options = {
      ...opts
    }
    options.filename = file.base
    options.plugins = [
      require('@babel/plugin-syntax-dynamic-import'),
      ...(options.plugins || [])
    ]
    options.babelrc = false
    options.configFile = false
    options.babelrcRoots = false
    const output = transform(file.data, options)
    file.data = Buffer.from(output.code)
  })
}
