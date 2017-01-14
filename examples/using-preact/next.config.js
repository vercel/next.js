module.exports = {
  alias: function ({ dev, env }) {
    // For the development version, we'll use React.
    // Because, it support react hot loading and so on.
    if (dev) return {}

    // We use preact for the production where it gives us better performance.
    return {
      'react': env === 'client' ? 'preact-compat/dist/preact-compat' : 'preact-compat',
      'react-dom': env === 'client' ? 'preact-compat/dist/preact-compat' : 'preact-compat'
    }
  }
}
