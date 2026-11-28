/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['./css-loader.js'],
      },
      '*.selfstat': {
        loaders: ['./self-stat-loader.js'],
        as: '*.js',
      },
    },
  },
  webpack(config) {
    config.module.rules.unshift({
      test: /globals\.css$/,
      enforce: 'pre',
      use: require.resolve('./css-loader.js'),
    })
    config.module.rules.push({
      test: /\.selfstat$/,
      use: require.resolve('./self-stat-loader.js'),
    })
    return config
  },
}

module.exports = nextConfig
