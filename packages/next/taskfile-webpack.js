const webpack = require('@rspack/core')

module.exports = function (task) {
  // eslint-disable-next-line require-yield
  task.plugin('webpack', {}, function* (_, options) {
    options = options || {}

    const compiler = webpack(options.config)

    if (options.watch) {
      return compiler.watch({}, (err, stats) => {
        if (err || stats.hasErrors()) {
          console.error(err || stats.toString())
        } else {
          console.log(`${options.name} compiled successfully.`)
        }
      })
    }

    return new Promise((resolve) => {
      compiler.run((err, stats) => {
        if (err || stats.hasErrors()) {
          return this.emit('plugin_error', {
            plugin: 'taskfile-webpack',
            error: err?.message ?? stats.toString(),
          })
        }

        if (stats.hasWarnings()) {
          this.emit('plugin_warning', {
            plugin: 'taskfile-webpack',
            warning: `webpack compiled ${options.name} with warnings:\n${stats.toString('errors-warnings')}`,
          })
        }

        if (process.env.ANALYZE_STATS) {
          require('fs').writeFileSync(
            require('path').join(__dirname, options.name + '-stats.json'),
            JSON.stringify(stats.toJson())
          )
        }

        resolve()
      })
    })
  })
}
