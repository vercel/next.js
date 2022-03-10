module.exports = function withReact18(config) {
  config.webpack = (webpackConfig) => {
    const { alias } = webpackConfig.resolve
    // Use react 18
    alias['react'] = 'react-18'
    alias['react-dom'] = 'react-dom-18'
    alias['react-dom/client'] = 'react-dom-18/client'
    alias['react-dom/server'] = 'react-dom-18/server'
    alias['react-dom/server.browser'] = 'react-dom-18/server.browser'

    return webpackConfig
  }
  return config
}
