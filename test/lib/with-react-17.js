module.exports = function withReact17(config) {
  config.webpack = (webpackConfig) => {
    const { alias } = webpackConfig.resolve
    // Use react 18
    alias['react'] = 'react-17'
    alias['react-dom'] = 'react-dom-17'
    alias['react-dom/client'] = 'react-dom-17/client'
    alias['react-dom/server'] = 'react-dom-17/server'
    alias['react-dom/server.browser'] = 'react-dom-17/server.browser'

    return webpackConfig
  }
  return config
}
