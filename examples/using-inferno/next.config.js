module.exports = {
  webpack: function (config, { dev }) {
    // For the development version, we'll use React.
    // Because, it support react hot loading and so on.
    if (dev) {
      return config
    }

    config.resolve.alias = {
      react: 'inferno-compat',
      'react-dom': 'inferno-compat'
    }
    return config
  }
}
