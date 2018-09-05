const webpack = require("webpack")

// Update these to match your package scope name.
const internalNodeModulesRegExp = /@zeit(?!.*node_modules)/
const externalNodeModulesRegExp = /node_modules(?!\/@zeit(?!.*node_modules))/

module.exports = {
  webpack: (config, { dev, isServer, defaultLoaders }) => {
    config.resolve.symlinks = false
    config.externals = config.externals.map(external => {
      if (typeof external !== "function") return external
      return (ctx, req, cb) => (internalNodeModulesRegExp.test(req) ? cb() : external(ctx, req, cb))
    })
    config.module.rules.push({
      test: /\.+(js|jsx)$/,
      loader: defaultLoaders.babel,
      include: [internalNodeModulesRegExp]
    })
    return config
  },
  webpackDevMiddleware: config => {
    const ignored = [config.watchOptions.ignored[0], externalNodeModulesRegExp]
    config.watchOptions.ignored = ignored
    return config
  }
}
