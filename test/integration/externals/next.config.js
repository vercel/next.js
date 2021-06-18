module.exports = {
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      'preact/compat': 'react',
    }

    return config
  },
}
