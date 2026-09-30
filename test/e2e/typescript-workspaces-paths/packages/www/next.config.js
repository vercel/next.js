const path = require('path')

// The deploy harness adds these aliases to the root config, but this app loads
// its config from packages/www.
if (process.env.NEXT_PRIVATE_TEST_MODE) {
  process.env.__NEXT_TEST_MODE = process.env.NEXT_PRIVATE_TEST_MODE
}
if (process.env.NEXT_PRIVATE_EXPERIMENTAL_CACHE_COMPONENTS) {
  process.env.__NEXT_CACHE_COMPONENTS =
    process.env.NEXT_PRIVATE_EXPERIMENTAL_CACHE_COMPONENTS
}
if (process.env.NEXT_PRIVATE_EXPERIMENTAL_PARTIAL_PREFETCHING) {
  process.env.__NEXT_PARTIAL_PREFETCHING =
    process.env.NEXT_PRIVATE_EXPERIMENTAL_PARTIAL_PREFETCHING
}
if (process.env.NEXT_PRIVATE_EXPERIMENTAL_CACHED_NAVIGATIONS) {
  process.env.__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS =
    process.env.NEXT_PRIVATE_EXPERIMENTAL_CACHED_NAVIGATIONS
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
