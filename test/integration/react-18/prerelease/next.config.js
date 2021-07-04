module.exports = {
  webpack(config) {
    const { alias } = config.resolve
    // FIXME: resolving react/jsx-runtime https://github.com/facebook/react/issues/20235
    alias['react/jsx-dev-runtime'] = require.resolve('react/jsx-dev-runtime.js')
    alias['react/jsx-runtime'] = require.resolve('react/jsx-runtime.js')

    // Use react 18
    alias['react'] = require.resolve('react-18')
    alias['react-dom'] = require.resolve('react-dom-18')

    return config
  },
}
