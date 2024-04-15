const webpack = require('webpack')
const path = require('path')
const TerserPlugin = require('terser-webpack-plugin')
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')

const pagesExternals = [
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
]

const appExternals = [
  // Externalize the react-dom/server legacy implementation outside of the runtime.
  // If users are using them and imported from 'react-dom/server' they will get the external asset bundled.
  'react-dom/cjs/react-dom-server-legacy.browser.development.js',
  'react-dom/cjs/react-dom-server-legacy.browser.production.min.js',
  'react-dom-experimental/cjs/react-dom-server-legacy.browser.development.js',
  'react-dom-experimental/cjs/react-dom-server-legacy.browser.production.min.js',
]

function makeAppAliases(reactChannel = '') {
  return {
    react$: `react${reactChannel}`,
    'react/react.react-server$': `react${reactChannel}/react.react-server`,
    'react-dom/server-rendering-stub$': `react-dom${reactChannel}/server-rendering-stub`,
    // 'react-dom$': `react-dom${reactChannel}/server-rendering-stub`,
    'react/jsx-runtime$': `react${reactChannel}/jsx-runtime`,
    'react/jsx-dev-runtime$': `react${reactChannel}/jsx-dev-runtime`,
    'react-dom/client$': `react-dom${reactChannel}/client`,
    'react-dom/server$': `react-dom${reactChannel}/server`,
    'react-dom/static$': `react-dom-experimental/static`,
    'react-dom/static.edge$': `react-dom-experimental/static.edge`,
    'react-dom/static.browser$': `react-dom-experimental/static.browser`,
    // optimizations to ignore the legacy build of react-dom/server in `server.browser` build
    'react-dom/server.edge$': `next/dist/build/webpack/alias/react-dom-server-edge${reactChannel}`,
    // In Next.js runtime only use react-dom/server.edge
    'react-dom/server.browser$': 'react-dom/server.edge',
    // react-server-dom-webpack alias
    'react-server-dom-turbopack/client$': `react-server-dom-turbopack${reactChannel}/client`,
    'react-server-dom-turbopack/client.edge$': `react-server-dom-turbopack${reactChannel}/client.edge`,
    'react-server-dom-turbopack/server.edge$': `react-server-dom-turbopack${reactChannel}/server.edge`,
    'react-server-dom-turbopack/server.node$': `react-server-dom-turbopack${reactChannel}/server.node`,
    'react-server-dom-webpack/client$': `react-server-dom-webpack${reactChannel}/client`,
    'react-server-dom-webpack/client.edge$': `react-server-dom-webpack${reactChannel}/client.edge`,
    'react-server-dom-webpack/server.edge$': `react-server-dom-webpack${reactChannel}/server.edge`,
    'react-server-dom-webpack/server.node$': `react-server-dom-webpack${reactChannel}/server.node`,
  }
}

const appAliases = makeAppAliases()
const appExperimentalAliases = makeAppAliases('-experimental')

const sharedExternals = [
  'styled-jsx',
  'styled-jsx/style',
  '@opentelemetry/api',
  '@ampproject/toolbox-optimizer',
  'edge-runtime',
  '@edge-runtime/ponyfill',
  'undici',
  'raw-body',
  'next/dist/server/capsize-font-metrics.json',
  'critters',
  'node-html-parser',
  'compression',
  'jsonwebtoken',
  '@opentelemetry/api',
  '@mswjs/interceptors/ClientRequest',
  'ws',
]

const externalsMap = {
  './web/sandbox': 'next/dist/server/web/sandbox',
}

const externalsRegexMap = {
  '(.*)trace/tracer$': 'next/dist/server/lib/trace/tracer',
}

const bundleTypes = {
  app: {
    'app-page': path.join(
      __dirname,
      'dist/esm/server/future/route-modules/app-page/module.js'
    ),
    'app-route': path.join(
      __dirname,
      'dist/esm/server/future/route-modules/app-route/module.js'
    ),
  },
  pages: {
    pages: path.join(
      __dirname,
      'dist/esm/server/future/route-modules/pages/module.js'
    ),
    'pages-api': path.join(
      __dirname,
      'dist/esm/server/future/route-modules/pages-api/module.js'
    ),
  },
  server: {
    server: path.join(__dirname, 'dist/esm/server/next-server.js'),
  },
}

module.exports = ({ dev, turbo, bundleType, experimental }) => {
  const externalHandler = ({ context, request, getResolve }, callback) => {
    ;(async () => {
      if (request.endsWith('.external')) {
        const resolve = getResolve()
        const resolved = await resolve(context, request)
        const relative = path.relative(
          path.join(__dirname, '..'),
          resolved.replace('esm' + path.sep, '')
        )
        const ext = path.extname(relative)

        callback(
          null,
          `commonjs ${
            ext === '.js' && ext !== path.extname(request)
              ? relative.replace(/\.js$/, '')
              : relative
          }`
        )
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
    entry: bundleTypes[bundleType],
    target: 'node',
    mode: 'production',
    output: {
      path: path.join(__dirname, 'dist/node_modules/next-server'),
      filename: `[name]${turbo ? '-turbo' : ''}${
        experimental ? '-experimental' : ''
      }.runtime.${dev ? 'dev' : 'prod'}.js`,
      libraryTarget: 'commonjs2',
    },
    devtool: 'source-map',
    optimization: {
      moduleIds: 'named',
      minimize: true,
      concatenateModules: true,
      minimizer: [
        new TerserPlugin({
          minify: TerserPlugin.swcMinify,
          terserOptions: {
            compress: {
              dead_code: true,
              // Zero means no limit.
              passes: 0,
            },
            format: {
              preamble: '',
            },
          },
        }),
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        'typeof window': JSON.stringify('undefined'),
        'process.env.NEXT_MINIMAL': JSON.stringify('true'),
        'this.serverOptions.experimentalTestProxy': JSON.stringify(false),
        'this.minimalMode': JSON.stringify(true),
        'this.renderOpts.dev': JSON.stringify(dev),
        'process.env.NODE_ENV': JSON.stringify(
          dev ? 'development' : 'production'
        ),
        'process.env.__NEXT_EXPERIMENTAL_REACT': JSON.stringify(
          experimental ? true : false
        ),
        'process.env.NEXT_RUNTIME': JSON.stringify('nodejs'),
        ...(!dev ? { 'process.env.TURBOPACK': JSON.stringify(turbo) } : {}),
      }),
      !!process.env.ANALYZE &&
        new BundleAnalyzerPlugin({
          analyzerPort: calculateUniquePort(
            dev,
            turbo,
            experimental,
            bundleType
          ),
          openAnalyzer: false,
          ...(process.env.CI
            ? {
                analyzerMode: 'static',
                reportFilename: path.join(
                  __dirname,
                  `dist/compiled/next-server/report.${dev ? 'dev' : 'prod'}-${
                    turbo ? 'turbo' : 'webpack'
                  }-${
                    experimental ? 'experimental' : 'stable'
                  }-${bundleType}.html`
                ),
              }
            : {}),
        }),
    ].filter(Boolean),
    stats: {
      optimizationBailout: true,
    },
    resolve: {
      alias:
        bundleType === 'app'
          ? experimental
            ? appExperimentalAliases
            : appAliases
          : {},
    },
    module: {
      rules: [
        {
          include: /[\\/]react-server\.node/,
          layer: 'react-server',
        },
        {
          include: /vendored[\\/]rsc[\\/]entrypoints/,
          resolve: {
            conditionNames: ['react-server', '...'],
            alias: {
              react$: `react${
                experimental ? '-experimental' : ''
              }/react.react-server`,
              'react-dom$': `react-dom${
                experimental ? '-experimental' : ''
              }/react-dom.react-server`,
            },
          },
          layer: 'react-server',
        },
        {
          issuerLayer: 'react-server',
          resolve: {
            conditionNames: ['react-server', '...'],
            alias: {
              react$: `react${
                experimental ? '-experimental' : ''
              }/react.react-server`,
              'react-dom$': `react-dom${
                experimental ? '-experimental' : ''
              }/react-dom.react-server`,
            },
          },
        },
      ],
    },
    externals: [
      ...sharedExternals,
      ...(bundleType === 'pages' ? pagesExternals : appExternals),
      externalsMap,
      externalHandler,
    ],
    experiments: {
      layers: true,
    },
  }
}

function calculateUniquePort(dev, turbo, experimental, bundleType) {
  const devOffset = dev ? 1000 : 0
  const turboOffset = turbo ? 200 : 0
  const experimentalOffset = experimental ? 40 : 0
  let bundleTypeOffset

  switch (bundleType) {
    case 'app':
      bundleTypeOffset = 1
      break
    case 'pages':
      bundleTypeOffset = 2
      break
    default:
      bundleTypeOffset = 3
  }

  return 8888 + devOffset + turboOffset + experimentalOffset + bundleTypeOffset
}
