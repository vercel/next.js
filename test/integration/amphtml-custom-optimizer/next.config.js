module.exports = {
  experimental: {
    amp: {
      validator: require.resolve('../../lib/amp-validator-wasm.js'),
      optimizer: {
        ampRuntimeVersion: '001515617716922',
        rtv: true,
        verbose: true,
      },
      skipValidation: true,
    },
  },
}
