const path = require('path')

module.exports = {
  webpack: function (config, { dev }) {
    // For the development version, we'll use React.
    // Because, it support react hot loading and so on.
    if (dev) {
      return config
    }

    config.resolve.alias = {
      ...config.resolve.alias,
      react: path.resolve('./lib/inferno-compat.js'),
      'react-dom': path.resolve('./lib/inferno-compat.js'),
      'react-dom/server': 'inferno-server'
    }

    return config
  }
}
