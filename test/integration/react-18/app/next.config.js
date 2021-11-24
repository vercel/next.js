module.exports = {
  experimental: {
    reactRoot: true,
    // concurrentFeatures: true,
  },
  webpack(config) {
    const { alias } = config.resolve
    // FIXME: resolving react/jsx-runtime https://github.com/facebook/react/issues/20235
    alias['react/jsx-dev-runtime'] = 'react/jsx-dev-runtime.js'
    alias['react/jsx-runtime'] = 'react/jsx-runtime.js'

    // Use react 18
    alias['react'] = 'react-18'
    alias['react-dom'] = 'react-dom-18'
    alias['react-dom/server'] = 'react-dom-18/server'

    return config
  },
}
