const withTM = require('next-plugin-transpile-modules')

module.exports = withTM({
  transpileModules: ['react-native-web'],
  webpack: config => {
    // Alias all `react-native` imports to `react-native-web`
    config.resolve.alias = {
      'react-native$': 'react-native-web'
    }

    return config
  }
})
