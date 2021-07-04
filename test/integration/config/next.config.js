const path = require('path')
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
    // When next-css is `npm link`ed we have to solve loaders from the project root
    const nextLocation = path.join(require.resolve('next/package.json'), '../')
    const nextCssNodeModulesLocation = path.join(
      require.resolve('@zeit/next-css'),
      '../../../node_modules'
    )

    if (nextCssNodeModulesLocation.indexOf(nextLocation) === -1) {
      config.resolveLoader.modules.push(nextCssNodeModulesLocation)
    }
    config.plugins.push(
      new webpack.DefinePlugin({
        'process.env.CONFIG_BUILD_ID': JSON.stringify(buildId),
      })
    )

    return config
  },
}
