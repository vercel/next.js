const path = require('path')
const withCSS = require('@zeit/next-css')
const withTM = require('next-transpile-modules')

const BG_IMAGES_DIRNAME = 'bgimages'

module.exports = withCSS(
  withTM({
    transpileModules: ['@patternfly'],
    // Webpack config from https://github.com/patternfly/patternfly-react-seed/blob/master/webpack.common.js
    webpack (config) {
      config.module.rules.push({
        test: /\.(svg|ttf|eot|woff|woff2)$/,
        // only process modules with this loader
        // if they live under a 'fonts' or 'pficon' directory
        include: [
          path.resolve(__dirname, 'node_modules/patternfly/dist/fonts'),
          path.resolve(
            __dirname,
            'node_modules/@patternfly/react-core/dist/styles/assets/fonts'
          ),
          path.resolve(
            __dirname,
            'node_modules/@patternfly/react-core/dist/styles/assets/pficon'
          ),
          path.resolve(
            __dirname,
            'node_modules/@patternfly/patternfly/assets/fonts'
          ),
          path.resolve(
            __dirname,
            'node_modules/@patternfly/patternfly/assets/pficon'
          )
        ],
        use: {
          loader: 'file-loader',
          options: {
            // Limit at 50k. larger files emited into separate files
            limit: 5000,
            publicPath: '/_next/static/fonts/',
            outputPath: 'static/fonts/',
            name: '[name].[ext]'
          }
        }
      })

      config.module.rules.push({
        test: /\.svg$/,
        include: input => input.indexOf('background-filter.svg') > 1,
        use: [
          {
            loader: 'url-loader',
            options: {
              limit: 5000,
              publicPath: '/_next/static/svgs/',
              outputPath: 'static/svgs/',
              name: '[name].[ext]'
            }
          }
        ]
      })

      config.module.rules.push({
        test: /\.svg$/,
        // only process SVG modules with this loader if they live under a 'bgimages' directory
        // this is primarily useful when applying a CSS background using an SVG
        include: input => input.indexOf(BG_IMAGES_DIRNAME) > -1,
        use: {
          loader: 'svg-url-loader',
          options: {}
        }
      })

      config.module.rules.push({
        test: /\.svg$/,
        // only process SVG modules with this loader when they don't live under a 'bgimages',
        // 'fonts', or 'pficon' directory, those are handled with other loaders
        include: input =>
          input.indexOf(BG_IMAGES_DIRNAME) === -1 &&
          input.indexOf('fonts') === -1 &&
          input.indexOf('background-filter') === -1 &&
          input.indexOf('pficon') === -1,
        use: {
          loader: 'raw-loader',
          options: {}
        }
      })

      config.module.rules.push({
        test: /\.(jpg|jpeg|png|gif)$/i,
        use: [
          {
            loader: 'url-loader',
            options: {
              limit: 5000,
              publicPath: '/_next/static/images/',
              outputPath: 'static/images/',
              name: '[name].[ext]'
            }
          }
        ]
      })

      return config
    }
  })
)
