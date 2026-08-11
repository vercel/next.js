const path = require('path')
const { webpack } = require('next/dist/compiled/webpack/webpack')

const mode = process.argv[2] === 'production' ? 'production' : 'development'
const publicPort = process.env.MF_PROXY_PORT || process.env.PORT || '3000'
const compiler = webpack([
  {
    mode,
    target: 'web',
    context: __dirname,
    entry: {},
    devtool: false,
    optimization: { minimize: false },
    output: {
      path: path.join(__dirname, 'apps/remote/public/webpack-remote'),
      publicPath: '/remote/webpack-remote/',
      uniqueName: 'webpackRemoteFixture',
      chunkFilename: '[name].js',
      clean: true,
    },
    plugins: [
      new webpack.container.ModuleFederationPlugin({
        name: 'webpackRemote',
        library: { type: 'var', name: 'webpackRemote' },
        filename: 'remoteEntry.js',
        exposes: {
          './Greeting': './webpack-remote/Greeting.js',
        },
      }),
    ],
  },
  {
    mode,
    target: 'web',
    context: __dirname,
    entry: './webpack-host/index.js',
    devtool: false,
    optimization: { minimize: false },
    output: {
      path: path.join(__dirname, 'apps/host/public/webpack-host/assets'),
      publicPath: '/webpack-host/assets/',
      uniqueName: 'webpackHostFixture',
      filename: 'main.js',
      chunkFilename: '[name].js',
      clean: true,
    },
    plugins: [
      new webpack.container.ModuleFederationPlugin({
        name: 'webpackHost',
        remotes: {
          remoteApp: `remoteApp@http://localhost:${publicPort}/remote/_next/static/custom/remoteEntry.js`,
        },
      }),
    ],
  },
])

compiler.run((error, stats) => {
  const failed = error || !stats || stats.hasErrors()

  if (error) {
    console.error(error)
  } else if (failed) {
    console.error(stats.toString({ all: false, errors: true }))
  }

  compiler.close((closeError) => {
    if (closeError) console.error(closeError)
    if (failed || closeError) process.exitCode = 1
  })
})
