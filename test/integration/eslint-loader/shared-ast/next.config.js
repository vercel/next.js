module.exports = {
  experimental: {
    enableInbuiltLint: true,
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    if (!isServer) {
      return config
    }
    const facadeLoaderConfig = JSON.parse(
      JSON.stringify(config.module.rules[0])
    ) // The eslint loader
    facadeLoaderConfig.use[0].loader = require.resolve('./facade-loader.js')
    delete facadeLoaderConfig.enforce
    config.module.rules.push({
      test: /\.(tsx|ts|js|mjs|jsx)$/,
      include: [
        '/Users/prateekbh/projects/next.js/test/integration/eslint-loader/shared-ast',
      ],
      use: [
        {
          loader: require.resolve('./facade-loader.js'),
        },
      ],
    })
    return config
  },
}
