/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    rules: {
      '*.mdx': {
        loaders: [require.resolve('./test-file-loader.js')],
        as: '*.js',
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.mdx/,
      use: require.resolve('./test-file-loader.js'),
    })
    return config
  },
}

module.exports = nextConfig
