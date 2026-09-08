/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      '*.resolve-test.js': {
        loaders: [require.resolve('./resolve-loader.js')],
        as: '*.js',
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.resolve-test\.js$/,
      use: require.resolve('./resolve-loader.js'),
    })
    return config
  },
}

module.exports = nextConfig
