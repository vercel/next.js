const webpack = require('@rspack/core')

module.exports = async function (_, options) {
  options = options || {}

  const compiler = webpack(options.config)

  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      if (err || stats.hasErrors()) {
        return reject(err || new Error(stats.toString()))
      }

      if (stats.hasWarnings()) {
        console.error(
          `webpack compiled ${options.name} with warnings:\n${stats.toString('errors-warnings')}`
        )
      }

      if (process.env.ANALYZE_STATS) {
        require('fs').writeFileSync(
          require('path').join(__dirname, '..', options.name + '-stats.json'),
          JSON.stringify(stats.toJson())
        )
      }

      resolve()
    })
  })
}
