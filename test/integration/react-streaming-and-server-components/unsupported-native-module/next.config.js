module.exports = {
  experimental: {
    reactRoot: true,
    concurrentFeatures: true,
    serverComponents: true,
  },
  webpack(config) {
    const { alias } = config.resolve
    alias['react/jsx-dev-runtime'] = 'react-18/jsx-dev-runtime.js'
    alias['react/jsx-runtime'] = 'react-18/jsx-runtime.js'

    // Use react 18
    alias['react'] = 'react-18'
    alias['react-dom'] = 'react-dom-18'
    alias['react-dom/server'] = 'react-dom-18/server'

    return config
  },
}
