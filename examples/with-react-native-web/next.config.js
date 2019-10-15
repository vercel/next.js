module.exports = {
  webpack: (config, { defaultLoaders }) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // Transform all direct `react-native` imports to `react-native-web`
      'react-native$': 'react-native-web'
    }
    defaultLoaders.babel.options.plugins = [
      ['react-native-web', { commonjs: true }]
    ]
    return config
  }
}
