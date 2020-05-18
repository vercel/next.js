const withCSS = require('@zeit/next-css')
const withFonts = require('next-fonts')
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin')

module.exports = withCSS(
  withFonts({
    webpack: config => {
      config.plugins.push(
        new MonacoWebpackPlugin({
          // Add languages as needed...
          languages: ['javascript', 'typescript'],
          filename: 'static/[name].worker.js',
        })
      )

      return config
    },
  })
)
