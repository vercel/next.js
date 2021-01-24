/* eslint-disable */
const withLess = require('@zeit/next-less')
const lessToJS = require('less-vars-to-js')
const cssVarsToLessAntd = require('postcss-css-vars-to-less-antd')
const { parse } = require('postcss')
const fs = require('fs')
const path = require('path')

// Where your antd-custom.less file lives
const themeVariables = lessToJS(
  fs.readFileSync(path.resolve(__dirname, './assets/antd-custom.less'), 'utf8')
)

// Support convert css variable to less
const process = parse(fs.readFileSync('./assets/globals.css', 'utf8'))
const newThemeVariables = cssVarsToLessAntd(process, themeVariables)

module.exports = withLess({
  lessLoaderOptions: {
    javascriptEnabled: true,
    modifyVars: newThemeVariables, // make your antd custom effective
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      const antStyles = /antd\/.*?\/style.*?/
      const origExternals = [...config.externals]
      config.externals = [
        (context, request, callback) => {
          if (request.match(antStyles)) return callback()
          if (typeof origExternals[0] === 'function') {
            origExternals[0](context, request, callback)
          } else {
            callback()
          }
        },
        ...(typeof origExternals[0] === 'function' ? [] : origExternals),
      ]

      config.module.rules.unshift({
        test: antStyles,
        use: 'null-loader',
      })
    }
    return config
  },
})
