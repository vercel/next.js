const { resolve } = require('path')
const { DefinePlugin } = require('webpack')

module.exports = {
  // context: resolve(__dirname, 'client'),
  entry: './client/next-prefetcher.js',
  output: {
    filename: '[name]-bundle.js',
    path: resolve(__dirname, 'dist/client')
  },
  plugins: [
    new DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify('production')
      }
    })
  ],
  module: {
    rules: [{
      test: /\.js$/,
      exclude: /node_modules/,
      loader: 'babel-loader',
      options: {
        babelrc: false,
        presets: [
          ['env', {
            targets: {
              // All browsers which supports service workers
              browsers: ['chrome 49', 'firefox 49', 'opera 41']
            }
          }]
        ]
      }
    }]
  }
}
