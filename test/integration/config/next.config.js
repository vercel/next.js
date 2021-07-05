module.exports = {
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60,
  },
  poweredByHeader: false,
  serverRuntimeConfig: {
    mySecret: 'secret',
  },
  publicRuntimeConfig: {
    staticFolder: '/static',
  },
  env: {
    customVar: 'hello',
  },
  webpack(config, { dev, buildId, webpack }) {
    if (dev) {
      if (config.bail !== false) {
        throw new Error('Wrong bail value for development!')
      }
    } else {
      if (config.bail !== true) {
        throw new Error('Wrong bail value for production!')
      }
    }

    config.plugins.push(
      new webpack.DefinePlugin({
        'process.env.CONFIG_BUILD_ID': JSON.stringify(buildId),
      })
    )

    return config
  },
}
