module.exports = {
  alias: function ({ dev, env }) {
    if (dev) return {}

    return {
      'react': 'inferno-compat',
      'react-dom/server': 'inferno-server',
      'react-dom': 'inferno-compat'
    }
  }
}
