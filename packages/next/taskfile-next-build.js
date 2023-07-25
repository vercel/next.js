const fs = require('fs').promises
const webpack = require('webpack')
const path = require('path')
const TerserPlugin = require('terser-webpack-plugin')
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')

const minimalExternals = [
  'react',
  'react/package.json',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/package.json',
  'react-dom/client',
  'react-dom/server',
  'react-dom/server.browser',
  'react-dom/server.edge',
  'react-server-dom-webpack/client',
  'react-server-dom-webpack/client.edge',
  'react-server-dom-webpack/server.edge',
  'react-server-dom-webpack/server.node',
  'styled-jsx',
  'styled-jsx/style',
  '@opentelemetry/api',
  'next/dist/compiled/@next/react-dev-overlay/dist/middleware',
  'next/dist/compiled/@ampproject/toolbox-optimizer',
  'next/dist/compiled/edge-runtime',
  'next/dist/compiled/@edge-runtime/ponyfill',
  'next/dist/compiled/undici',
  'next/dist/compiled/raw-body',
  'next/dist/server/capsize-font-metrics.json',
  'critters',
  'next/dist/compiled/node-html-parser',
  'next/dist/compiled/compression',
  'next/dist/compiled/jsonwebtoken',
  'next/dist/compiled/@opentelemetry/api',
]

const externalsMap = {
  '/(.*)config$/': 'next/dist/server/config',
  './web/sandbox': 'next/dist/server/web/sandbox',
}

const externalHandler = ({ context, request }, callback) => {
  callback()
}

async function buildNextServer(task) {
  // cleanup old files
  await fs.rm(path.join(__dirname, 'dist/compiled/minimal-next-server'), {
    recursive: true,
    force: true,
  })

  /** @type {webpack.Configuration} */
  const config = {
    entry: {
      server: path.join(__dirname, 'dist/esm/server/next-server.js'),
      'app-page-render': path.join(
        __dirname,
        'dist/esm/server/future/route-modules/app-page/module.js'
      ),
      'pages-render': path.join(
        __dirname,
        'dist/esm/server/future/route-modules/pages/module.js'
      ),
      'pages-api': path.join(
        __dirname,
        'dist/esm/server/future/route-modules/pages-api/module.js'
      ),
    },
    target: 'node',
    mode: 'production',
    output: {
      path: path.join(__dirname, 'dist/compiled/minimal-next-server'),
      filename: '[name].runtime.js',
      libraryTarget: 'commonjs2',
    },
    // left in for debugging
    optimization: {
      // moduleIds: 'named',
      minimize: false,
      // minimize: true,
      // splitChunks: {
      //   chunks: 'all',
      // },
      concatenateModules: false,
      minimizer: [
        new TerserPlugin({
          extractComments: false,
          terserOptions: {
            format: {
              comments: false,
            },
            compress: {
              passes: 2,
            },
          },
        }),
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        'this.minimalMode': JSON.stringify(true),
        'this.renderOpts.dev': JSON.stringify(false),
        'process.env.NODE_ENV': JSON.stringify('production'),
        'process.env.NEXT_MINIMAL': JSON.stringify('true'),
        'process.env.NEXT_RUNTIME': JSON.stringify('nodejs'),
      }),
      !!process.env.ANALYZE && new BundleAnalyzerPlugin({}),
    ].filter(Boolean),
    stats: {
      // Display bailout reasons
      optimizationBailout: true,
    },
    externals: [...minimalExternals, externalsMap, externalHandler],
  }

  await new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) return reject(err)
      if (stats.hasErrors()) {
        return reject(new Error(stats.toString('errors-only')))
      } else {
        fs.writeFile(
          path.join(
            __dirname,
            'dist/compiled/minimal-next-server',
            'stats.json'
          ),
          JSON.stringify(stats.toJson()),
          'utf8'
        )
        return resolve()
      }
    })
  })

  return
}

module.exports = {
  buildNextServer,
}

if (require.main === module) {
  buildNextServer().then(() => {
    console.log('Success!')
  })
}
