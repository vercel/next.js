module.exports = {
  webpack: (config, { dev }) => {
    if (!dev) {
      config.resolve.alias = {
        'react-dom/server': require.resolve('react-dom/dist/react-dom-server.min.js')
      }
    }
    return config
  }
}
