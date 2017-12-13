const path = require('path')
const ExtractTextPlugin = require('extract-text-webpack-plugin')
const exportPathMap = require('./routes').exportPathMap

module.exports = {
  webpack: (config, { buildId, dev }) => {
    config.module.rules.push({
      test: /\.((sa|sc|c)ss|jpg|png)$/,
      use: [
        {
          loader: 'emit-file-loader',
          options: {
            name: 'dist/[path][name].[ext]'
          }
        }
      ]
    })

    config.module.rules.push({
      test: /\.(jpg|png|svg)$/,
      use: [
        {
          loader: 'url-loader',
          options: {
            limit: 10000,
            name: '.static/assets/[hash].[ext]',
            outputPath: dev ? path.join(__dirname, '/') : undefined,
            publicPath: function (url) {
              return url.replace(/^.*.static/, '/static')
            }
          }
        }
      ]
    })

    config.module.rules.push({
      test: /\.(sa|sc|c)ss$/,
      use: ['extracted-loader'].concat(
        ExtractTextPlugin.extract({
          use: [
            'babel-loader',
            {
              loader: 'css-loader',
              options: {
                url: true,
                minimize: !dev,
                sourceMap: dev,
                importLoaders: 2
              }
            },
            {
              loader: 'postcss-loader',
              options: {
                plugins: [
                  require('autoprefixer')({
                    /* options */
                  })
                ]
              }
            },
            {
              loader: 'sass-loader'
            }
          ]
        })
      )
    })

    config.plugins.push(
      new ExtractTextPlugin({
        filename: dev
          ? path.join(__dirname, '.static/assets/index.css')
          : '.static/assets/' + buildId + '.css',
        allChunks: true
      })
    )

    return config
  },
  useFileSystemPublicRoutes: false,
  exportPathMap
}
