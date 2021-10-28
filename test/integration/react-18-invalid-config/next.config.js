module.exports = {
  experimental: {
    reactRoot: true,
    concurrentFeatures: true,
    serverComponents: true,
  },
  webpack(config) {
    const { alias } = config
    alias['react'] = 'react-18'
    alias['react-dom'] = 'react-dom-18'
    alias['react-dom/server'] = 'react-dom-18/server'
    return alias
  },
}
