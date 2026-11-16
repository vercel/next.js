module.exports = {
  turbopack: {
    rules: {
      '*.slow.js': {
        loaders: ['./slow-loader.js'],
        as: '*.js',
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.slow\.js$/,
      use: [require.resolve('./slow-loader.js')],
    })
    return config
  },
}
