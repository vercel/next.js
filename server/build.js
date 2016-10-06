import { resolve, dirname, basename } from 'path'
import webpack from 'webpack'
import { transformFile } from 'babel-core'
import MemoryFS from 'memory-fs'
import preset2015 from 'babel-preset-es2015'
import presetReact from 'babel-preset-react'
import transformAsyncToGenerator from 'babel-plugin-transform-async-to-generator'
import transformClassProperties from 'babel-plugin-transform-class-properties'
import transformObjectRestSpread from 'babel-plugin-transform-object-rest-spread'
import transformRuntime from 'babel-plugin-transform-runtime'
import moduleAlias from 'babel-plugin-module-alias'

const babelRuntimePath = require.resolve('babel-runtime/package')
.replace(/[\\\/]package\.json$/, '');

export function transpile (path) {
  return new Promise((resolve, reject) => {
    transformFile(path, {
      presets: [preset2015, presetReact],
      plugins: [
        transformAsyncToGenerator,
        transformClassProperties,
        transformObjectRestSpread,
        transformRuntime,
        [
          moduleAlias,
          [
            { src: `npm:${babelRuntimePath}`, expose: 'babel-runtime' },
            { src: `npm:${require.resolve('react')}`, expose: 'react' }
          ]
        ]
      ],
      ast: false
    }, (err, result) => {
      if (err) return reject(err)
      resolve(result.code)
    })
  })
}

export function bundle (path) {
  const fs = new MemoryFS()

  const compiler = webpack({
    entry: path,
    output: {
      path: dirname(path),
      filename: basename(path),
      libraryTarget: 'commonjs2'
    },
    externals: [
      'react',
      'react-dom',
      'next',
      'next/head',
      'next/link',
      'next/component',
      'next/app',
      {
        [require.resolve('react')]: 'react'
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

  compiler.outputFileSystem = fs

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

      resolve(fs.readFileSync(path))
    })
  })
}
