module.exports = {
  turbopack: {
    rules: {
      '*.sentinel': {
        loaders: ['./sentinel-loader.js'],
        as: '*.js',
      },
    },
  },
  experimental: {
    mcpServer: true,
  },
}
