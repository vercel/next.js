/* eslint-disable */
const withLess = require('./less-config')
const lessToJS = require('less-vars-to-js')
const path = require('path')
const fs = require('fs')
const resolve = require('resolve')

// Where your antd-custom.less file lives
const themeVariables = lessToJS(
  fs.readFileSync(path.resolve(__dirname, './less-config/default.less'), 'utf8')
)

if (typeof require !== 'undefined') {
  require.extensions['.less'] = () => {}
  require.extensions['.css'] = () => {}
}

module.exports = withLess({
  cssModules: true,
  cssLoaderOptions: {
    url: false,
    modules: {
      localIdentName: '[local]-[hash:base64:4]'
    },
    import: true
  },
  lessLoaderOptions: {
    javascriptEnabled: true,
    modifyVars: themeVariables
  },
  webpack: (config, options) => {
    const { isServer, dir } = options

    if (isServer) {
      const antStyles = /antd-mobile\/.*?\/style.*?/

      config.externals = [
        (_, request, callback) => {
          const notExternalModules = [
            'next/app',
            'next/document',
            'next/link',
            'next/error',
            'string-hash',
            'next/constants'
          ]

          if (notExternalModules.indexOf(request) !== -1) {
            return callback()
          }

          resolve(
            request,
            { baseDir: dir, preserveSymlinks: true },
            (err, res) => {
              if (err) {
                return callback()
              }

              if (!res) {
                return callback()
              }

              if (
                res.match(/next[/\\]dist[/\\]/) ||
                res.match(/node_modules[/\\]@babel[/\\]runtime[/\\]/) ||
                res.match(/node_modules[/\\]@babel[/\\]runtime-corejs2[/\\]/)
              ) {
                return callback()
              }

              if (
                res.match(/node_modules[/\\]webpack/) ||
                res.match(/node_modules[/\\]css-loader/)
              ) {
                return callback()
              }

              if (res.match(/node_modules[/\\]styled-jsx/)) {
                return callback()
              }

              if (
                res.match(/node_modules[/\\].*\.js/) &&
                !res.match(/node_modules[/\\]webpack/) &&
                !res.match(antStyles)
              ) {
                return callback(null, `commonjs ${request}`)
              }

              callback()
            }
          )
        }
      ]

      config.module.rules.unshift({
        test: antStyles,
        use: 'null-loader'
      })
    }

    return config
  }
})
