module.exports = {
  webpack(config, { isServer }) {
    config.resolve.alias = {
      ...config.resolve.alias,
      'preact/compat': 'react',
    }
    return config
  },
}
