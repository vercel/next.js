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
  './web/sandbox': 'next/dist/server/web/sandbox',
}

const externalsRegexMap = {
  '(.*)trace/tracer$': 'next/dist/server/lib/trace/tracer',
}

module.exports = ({ dev, turbo }) => {
  const externalHandler = ({ context, request, getResolve }, callback) => {
    ;(async () => {
      if (
        ((dev || turbo) && request.endsWith('.shared-runtime')) ||
        request.endsWith('.external')
      ) {
        const resolve = getResolve()
        const resolved = await resolve(context, request)
        const relative = path.relative(
          path.join(__dirname, '..'),
          resolved.replace('esm' + path.sep, '')
        )
        callback(null, `commonjs ${relative}`)
      } else {
        const regexMatch = Object.keys(externalsRegexMap).find((regex) =>
          new RegExp(regex).test(request)
        )
        if (regexMatch) {
          return callback(null, 'commonjs ' + externalsRegexMap[regexMatch])
        }
        callback()
      }
    })()
  }

  /** @type {webpack.Configuration} */
  return {
    entry: {
      server: path.join(__dirname, 'dist/esm/server/next-server.js'),
      'app-page': path.join(
        __dirname,
        'dist/esm/server/future/route-modules/app-page/module.js'
      ),
      'app-route': path.join(
        __dirname,
        'dist/esm/server/future/route-modules/app-route/module.js'
      ),
      pages: path.join(
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
      path: path.join(__dirname, 'dist/compiled/next-server'),
      filename: `[name]${turbo ? '-turbo' : ''}.runtime.${
        dev ? 'dev' : 'prod'
      }.js`,
      libraryTarget: 'commonjs2',
    },
    optimization: {
      moduleIds: 'named',
      minimize: true,
      // splitChunks: {
      //   chunks: 'all',
      // },
      concatenateModules: true,
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
        'process.env.NEXT_MINIMAL': JSON.stringify('true'),
        'this.minimalMode': JSON.stringify(true),
        'this.renderOpts.dev': JSON.stringify(dev),
        'process.env.NODE_ENV': JSON.stringify(
          dev ? 'development' : 'production'
        ),
        'process.env.NEXT_RUNTIME': JSON.stringify('nodejs'),
      }),
      !!process.env.ANALYZE &&
        new BundleAnalyzerPlugin({
          analyzerPort: dev ? 8888 : 8889,
        }),
    ].filter(Boolean),
    stats: {
      optimizationBailout: true,
    },
    externals: [...minimalExternals, externalsMap, externalHandler],
  }
}
