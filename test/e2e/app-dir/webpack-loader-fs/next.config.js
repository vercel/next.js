/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      '*.parent-stat': {
        loaders: ['./stat-parent-loader.js'],
        as: '*.js',
      },
      '*.stat': {
        loaders: ['./stat-loader.js'],
        as: '*.js',
      },
      '*.txt': {
        loaders: ['./test-file-loader.js'],
        as: '*.js',
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.parent-stat$/,
      use: './stat-parent-loader.js',
    })
    config.module.rules.push({ test: /\.stat$/, use: './stat-loader.js' })
    config.module.rules.push({
      test: /\.txt/,
      use: './test-file-loader.js',
    })
    return config
  },
}

module.exports = nextConfig
