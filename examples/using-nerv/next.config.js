module.exports = {
  webpack: function (config, { dev }) {
    // For the development version, we'll use React.
    // Because, it supports react hot loading and so on.
    if (dev) {
      return config
    }

    config.resolve.alias = {
      react: 'nervjs',
      'react-dom': 'nervjs'
    }

    return config
  }
}
