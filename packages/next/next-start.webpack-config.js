const path = require('path')
const webpack = require('@rspack/core')
const DevToolsIgnoreListPlugin = require('./webpack-plugins/devtools-ignore-list-plugin')

const esmDir = path.join(__dirname, 'dist/esm')
// Keep shared state and modules that use the installed file layout in Node.
const externalModules = [
  'build/next-config-ts',
  'build/swc',
  'cli',
  'next-devtools',
  'server/dev',
  'server/image-optimizer',
  'server/lib/cpu-profile',
  'server/lib/router-utils/setup-dev-bundler',
  'server/lib/trace/tracer',
  'server/next-typescript',
  'server/require-hook',
  'server/web/sandbox',
  'telemetry',
  'trace',
]

/** @type {import('@rspack/core').Configuration} */
module.exports = {
  entry: path.join(esmDir, 'server/lib/start-server.js'),
  target: 'node',
  mode:
    process.env.NEXT_DEBUG_INTERNALS === 'true' ? 'development' : 'production',
  output: {
    path: path.join(__dirname, 'dist/compiled/next-server'),
    filename: 'start-server.runtime.prod.js',
    library: { type: 'commonjs2' },
  },
  devtool: 'source-map',
  externalsType: 'commonjs',
  externals: [
    ({ context, request }, callback) => {
      if (!request.startsWith('.') && !path.isAbsolute(request)) {
        return callback(null, request)
      }
      const relative = path
        .relative(esmDir, path.resolve(context, request))
        .replace(/\\/g, '/')
        .replace(/\.js$/, '')
      if (
        /\.(external|compiled)$/.test(relative) ||
        externalModules.some(
          (id) => relative === id || relative.startsWith(id + '/')
        )
      ) {
        return callback(null, `next/dist/${relative}`)
      }
      callback()
    },
  ],
  module: {
    parser: {
      javascript: {
        commonjs: { exports: 'skipInEsm' },
        requireAsExpression: false,
        requireDynamic: false,
        requireResolve: false,
        importDynamic: false,
      },
    },
    rules: [{ test: /\.m?js$/, loader: 'source-map-loader', enforce: 'pre' }],
  },
  optimization: {
    minimizer: [
      new webpack.SwcJsMinimizerRspackPlugin({
        minimizerOptions: {
          // Match the runtime build's conditional-compression workaround.
          compress: { conditionals: false },
          mangle: !process.env.NEXT_SERVER_NO_MANGLE,
        },
      }),
    ],
  },
  plugins: [new DevToolsIgnoreListPlugin({ shouldIgnorePath: () => true })],
}
