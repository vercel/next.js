const esNodeModules = /react-native-web(?!.*node_modules)/
const cjsNodeModules = /node_modules\/(?!react-native-web(?!.*node_modules))/

module.exports = {
  webpack: (config, { buildId, dev, isServer, defaultLoaders }) => {
    // Alias all `react-native` imports to `react-native-web`
    config.resolve.alias = {
      'react-native$': 'react-native-web'
    }

    // Compile ES modules
    config.resolve.symlinks = false
    config.externals = config.externals.map(
      external =>
        typeof external === 'function'
          ? (ctx, req, cb) => (esNodeModules.test(req) ? cb(null) : external(ctx, req, cb))
          : external
    )
    config.module.rules.push({
      test: /\.js$/,
      loader: defaultLoaders.babel,
      include: [esNodeModules]
    })

    return config
  },
  webpackDevMiddleware: config => {
    // Ignore CJS modules
    config.watchOptions.ignored = [config.watchOptions.ignored[0], cjsNodeModules]
    return config
  }
}
