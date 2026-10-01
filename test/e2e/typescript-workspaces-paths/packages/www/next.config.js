const path = require('path')

// This app loads its config from packages/www, bypassing the root config's alias.
if (process.env.NEXT_PRIVATE_TEST_MODE) {
  process.env.__NEXT_TEST_MODE = process.env.NEXT_PRIVATE_TEST_MODE
}

module.exports = {
  webpack: function (config, { defaultLoaders }) {
    const resolvedBaseUrl = path.resolve(config.context, '../../')
    config.module.rules = [
      ...config.module.rules,
      {
        test: /\.(tsx|ts|js|mjs|jsx)$/,
        include: [resolvedBaseUrl],
        use: defaultLoaders.babel,
        exclude: (excludePath) => {
          return /node_modules/.test(excludePath)
        },
      },
    ]
    return config
  },

  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60,
  },
}
