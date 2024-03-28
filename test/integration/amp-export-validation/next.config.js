module.exports = {
  output: 'export',
  experimental: {
    amp: {
      validator: require.resolve('../../lib/amp-validator-wasm.js'),
    },
  },
  // exportPathMap
}
