module.exports = {
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    defaultLoaders.babel.options.rootMode = 'upward'
    return config
  },
}
