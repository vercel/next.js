module.exports = {
  webpack: (config, { dev }) => {
    if (!dev) {
      config.resolve.alias = {
        'react-dom/server': require.resolve('react-dom/umd/react-dom-server.browser.production.min.js')
      }
    }
    return config
  }
}
