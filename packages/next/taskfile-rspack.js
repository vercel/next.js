const rspack = require('@rspack/core')

module.exports = function (task) {
  // eslint-disable-next-line require-yield
  task.plugin('rspack', {}, function* (_, options) {
    options = options || {}

    const compiler = rspack(options.config)

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
            plugin: 'taskfile-rspack',
            error: err?.message ?? stats.toString(),
          })
        }

        if (stats.hasWarnings()) {
          this.emit('plugin_warning', {
            plugin: 'taskfile-rspack',
            warning: `rspack compiled ${options.name} with warnings:\n${stats.toString('errors-warnings')}`,
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
