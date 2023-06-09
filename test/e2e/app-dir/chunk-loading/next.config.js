module.exports = {
  webpack: (config) => {
    config.plugins.push((c) => {
      c.hooks.done.tap('config', (stats) => {
        console.log(
          stats.toString({
            colors: true,
            errorDetails: true,
            assets: false,
            modules: false,
          })
        )
      })
    })
    return config
  },
}
