const fs = require('fs').promises
const webpack = require('webpack')
const path = require('path')
const Module = require('module')
const vm = require('vm')
const TerserPlugin = require('terser-webpack-plugin')
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')

async function buildNextServer(task) {
  const outputName = 'next-server.js'
  const cachedOutputName = `${outputName}.cache`

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
  ].reduce((acc, pkg) => {
    acc[pkg] = pkg
    return acc
  }, {})

  Object.assign(minimalExternals, {
    '/(.*)config$/': 'next/dist/server/config',
    './web/sandbox': 'next/dist/server/web/sandbox',
  })

  // const BundleAnalyzerPlugin =
  //   require('webpack-bundle-analyzer').BundleAnalyzerPlugin
  /** @type {webpack.Configuration} */
  const config = {
    entry: {
      server: path.join(__dirname, 'dist/server/next-server.js'),
      'app-page-render': path.join(
        __dirname,
        'dist/server/future/route-modules/app-page/module.js'
      ),
      'pages-render': path.join(
        __dirname,
        'dist/server/future/route-modules/pages/module.js'
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
      moduleIds: 'named',
      minimize: false,
      // minimize: true,
      splitChunks: {
        chunks: 'all',
      },
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
        'process.env.NODE_ENV': JSON.stringify('production'),
        'process.env.NEXT_MINIMAL': JSON.stringify('true'),
        'process.env.NEXT_RUNTIME': JSON.stringify('nodejs'),
      }),
      // new BundleAnalyzerPlugin({}),
    ],
    externals: [minimalExternals],
  }

  await new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) return reject(err)
      if (stats.hasErrors()) {
        return reject(new Error(stats.toString('errors-only')))
      }
      resolve()
    })
  })

  return

  const wrappedTemplate = `
  const filename = ${JSON.stringify(outputName)}
  const { readFileSync } = require('fs'),
    { Script } = require('vm'),
    { wrap } = require('module'),
    { join } = require('path');
  const basename = join(__dirname, filename)
  
  const source = readFileSync(basename, 'utf-8')
  
  const cachedData =
    !process.pkg &&
    require('process').platform !== 'win32' &&
    readFileSync(join(__dirname, '${cachedOutputName}'))
    
  const scriptOpts = { filename: basename, columnOffset: 0 }
  
  const script = new Script(
    wrap(source),
    cachedData ? Object.assign({ cachedData }, scriptOpts) : scriptOpts
  )
  
  script.runInThisContext()(exports, require, module, __filename, __dirname)
  `

  await fs.writeFile(
    path.join(
      __dirname,
      `dist/compiled/minimal-next-server/next-server-cached.js`
    ),
    wrappedTemplate
  )

  const filename = path.resolve(
    __dirname,
    'dist/compiled/minimal-next-server',
    outputName
  )

  const content = require('fs').readFileSync(filename, 'utf8')

  const wrapper = Module.wrap(content)
  var script = new vm.Script(wrapper, {
    filename: filename,
    lineOffset: 0,
    displayErrors: true,
  })

  script.runInThisContext()(exports, require, module, __filename, __dirname)

  const buffer = script.createCachedData()

  await fs.writeFile(
    path.join(
      __dirname,
      `dist/compiled/minimal-next-server/${cachedOutputName}`
    ),
    buffer
  )
}

module.exports = {
  buildNextServer,
}

if (require.main === module) {
  buildNextServer().then(() => {
    console.log('done')
  })
}
