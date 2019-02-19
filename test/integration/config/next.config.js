const withCSS = require('@zeit/next-css')
const withSass = require('@zeit/next-sass')
const webpack = require('webpack')
const path = require('path')
module.exports = withCSS(withSass({
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60,
    websocketPort: 3001
  },
  cssModules: true,
  serverRuntimeConfig: {
    mySecret: 'secret'
  },
  publicRuntimeConfig: {
    staticFolder: '/static'
  },
  env: {
    customVar: 'hello'
  },
  webpack (config, {buildId}) {
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
        'process.env.CONFIG_BUILD_ID': JSON.stringify(buildId)
      })
    )

    return config
  }
}))
