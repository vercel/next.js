module.exports = {
  webpack: function (config) {
    config.resolve.alias = {
      'react': 'preact-compat/dist/preact-compat',
      'react-dom': 'preact-compat/dist/preact-compat'
    }
    return config
  },

  aliases: function ({ dev, env }) {
    return {
      'react': 'preact-compat',
      'react-dom': 'preact-compat'
    }
  }
}
