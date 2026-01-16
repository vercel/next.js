/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    rules: {
      '*.mdx': {
        loaders: [require.resolve('./test-file-loader.js')],
        as: '*.js',
      },
      '*.txt': [
        {
          condition: { query: '?reverse' },
          loaders: [require.resolve('./reverse-loader.js')],
          as: '*.js',
        },
      ],
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.mdx/,
      use: require.resolve('./test-file-loader.js'),
    })
    config.module.rules.push({
      resourceQuery: '?reverse',
      use: require.resolve('./reverse-loader.js'),
    })
    return config
  },
}

module.exports = nextConfig
