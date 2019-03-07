const withTypescript = require('@zeit/next-typescript')
const withSass = require('@zeit/next-sass')

module.exports = withTypescript(
  withSass({
    webpack (config) {
      // Fixes npm packages that depend on `fs` module
      config.node = {
        fs: 'empty'
      }

      return config
    }
  })
)
