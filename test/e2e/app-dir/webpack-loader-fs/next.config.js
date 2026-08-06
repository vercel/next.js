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
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.txt/,
      use: './test-file-loader.js',
    })
    return config
  },
}

module.exports = nextConfig
