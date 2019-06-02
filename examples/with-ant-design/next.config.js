/* eslint-disable */
const withCss = require('@zeit/next-css')

module.exports = withCss({
  webpack: (config, { isServer, webpack }) => {
    if (isServer) {
      const antStyles = /antd\/.*?\/style\/css.*?/
      const origExternal = config.externals[0]
      config.externals = [
        (context, request, callback) => {
          if (request.match(antStyles)) return callback()
          origExternal(context, request, callback)
        },
      ]

      config.module.rules.unshift({
        test: antStyles,
        use: 'null-loader',
      })
    }
    return config
  },
})
