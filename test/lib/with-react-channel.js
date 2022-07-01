module.exports = function withReactChannel(channel, config) {
  config.webpack = (webpackConfig) => {
    const { alias } = webpackConfig.resolve
    // Use react 18
    alias['react'] = `react-${channel}`
    alias['react-dom'] = `react-dom-${channel}`
    alias['react-dom/client'] = `react-dom-${channel}/client`
    alias['react-dom/server'] = `react-dom-${channel}/server`
    alias['react-dom/server.browser'] = `react-dom-${channel}/server.browser`

    return webpackConfig
  }
  return config
}
