module.exports = {
  webpack: function (config) {
    config.resolve.alias = {
      'react': require.resolve('./rax-compat'),
      'react-dom': require.resolve('./rax-compat')
    }
    return config
  }
}
