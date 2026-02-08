/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      'error.data': {
        loaders: [require.resolve('./loaders/error-loader.js')],
        as: '*.js',
      },
      'string-error.data': {
        loaders: [require.resolve('./loaders/string-error-loader.js')],
        as: '*.js',
      },
      'promise-error.data': {
        loaders: [require.resolve('./loaders/promise-error-loader.js')],
        as: '*.js',
      },
      'timeout-error.data': {
        loaders: [require.resolve('./loaders/timeout-error-loader.js')],
        as: '*.js',
      },
    },
  },
  webpack(config) {
    config.module.rules.push(
      {
        test: /[\\/]error\.data$/,
        use: [require.resolve('./loaders/error-loader.js')],
      },
      {
        test: /string-error\.data$/,
        use: [require.resolve('./loaders/string-error-loader.js')],
      },
      {
        test: /promise-error\.data$/,
        use: [require.resolve('./loaders/promise-error-loader.js')],
      },
      {
        test: /timeout-error\.data$/,
        use: [require.resolve('./loaders/timeout-error-loader.js')],
      }
    )
    return config
  },
}

module.exports = nextConfig
