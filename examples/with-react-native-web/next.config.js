module.exports = {
  webpack: (config, { defaultLoaders }) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // Transform all direct `react-native` imports to `react-native-web`
      'react-native$': 'react-native-web'
    }
    config.resolve.extensions.push('.web.js', '.web.ts', '.web.tsx')
    return config
  }
}
