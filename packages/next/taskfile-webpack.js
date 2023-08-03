const webpack = require('webpack')

module.exports = function (task) {
  task.plugin('webpack', {}, function* (_, options) {
    options = options || {}

    const compiler = webpack(options.config)

    if (options.watch) {
      compiler.watch({}, (err, stats) => {
        if (err || stats.hasErrors()) {
          console.error(err || stats.toString())
        } else {
          console.log(`${options.name} compiled successfully.`)
        }
      })
    } else {
      yield new Promise((resolve, reject) => {
        compiler.run((err, stats) => {
          if (err || stats.hasErrors()) {
            console.error(err || stats.toString())
            reject(err || stats.toString())
          }
          resolve()
        })
      })
    }
  })
}
