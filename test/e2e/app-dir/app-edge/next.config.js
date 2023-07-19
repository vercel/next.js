module.exports = {
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.plugins.push((c) =>
      c.hooks.done.tap('test', (stats) =>
        console.log(stats.toString({ errorDetails: true }))
      )
    )
    return config
  },
}
