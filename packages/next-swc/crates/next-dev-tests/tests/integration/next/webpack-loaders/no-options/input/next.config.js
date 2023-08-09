module.exports = {
  experimental: {
    turbo: {
      rules: {
        '*.raw.*': {
          loaders: ['raw-loader'],
          as: '*',
        },
        '*.raw': ['raw-loader'],
        '*.jraw': {
          loaders: ['raw-as-json-loader'],
          as: '*.json',
        },
        './raw/**': ['raw-loader'],
      },
    },
  },
}
