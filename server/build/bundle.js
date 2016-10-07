import { resolve, dirname, basename } from 'path'
import webpack from 'webpack'

export default function bundle (src, dst) {
  const compiler = webpack({
    entry: src,
    output: {
      path: dirname(dst),
      filename: basename(dst),
      libraryTarget: 'commonjs2'
    },
    externals: [
      'react',
      'react-dom',
      {
        [require.resolve('react')]: 'react',
        [require.resolve('../../lib/link')]: 'next/link',
        [require.resolve('../../lib/css')]: 'next/css',
        [require.resolve('../../lib/head')]: 'next/head'
      }
    ],
    resolveLoader: {
      root: resolve(__dirname, '..', '..', 'node_modules')
    },
    plugins: [
      new webpack.optimize.UglifyJsPlugin({
        compress: { warnings: false },
        sourceMap: false
      })
    ],
    module: {
      preLoaders: [
        { test: /\.json$/, loader: 'json-loader' }
      ]
    }
  })

  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      if (err) return reject(err)

      const jsonStats = stats.toJson()
      if (jsonStats.errors.length > 0) {
        const error = new Error(jsonStats.errors[0])
        error.errors = jsonStats.errors
        error.warnings = jsonStats.warnings
        return reject(error)
      }

      resolve()
    })
  })
}
