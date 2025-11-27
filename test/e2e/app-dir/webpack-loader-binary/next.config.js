/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      '*.txt': {
        loaders: ['./test-file-loader.js'],
        as: '*.js',
      },
      '*.mp4': {
        loaders: [require.resolve('./test-file-loader.js')],
        as: '*.js',
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.txt/,
      use: './test-file-loader.js',
    })
    config.module.rules.push({
      test: /\.mp4/,
      use: require.resolve('./test-file-loader.js'),
    })
    return config
  },
}

module.exports = nextConfig
