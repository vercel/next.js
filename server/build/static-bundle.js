import fs from 'fs'
import { join } from 'path'
import mkdirp from 'mkdirp-then'
import webpack from 'webpack'
import getConfig from '../config'
import { runCompiler } from './'

const nextNodeModulesDir = join(__dirname, '..', '..', '..', 'node_modules')
const nodePathList = (process.env.NODE_PATH || '')
  .split(process.platform === 'win32' ? ';' : ':')
  .filter((p) => !!p)

export default async function createStaticBundle (dir, { dev = false } = {}) {
  const config = getConfig(dir)
  const { staticModules } = config
  if (!staticModules) return

  const dotNextDir = join(dir, '.next')
  const requireFileName = join(dotNextDir, `__require-cache.js`)
  await mkdirp(dotNextDir)
  createRequireBundle(requireFileName, staticModules({ dev }))

  const plugins = []

  if (!dev) {
    plugins.push(
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('production')
      }),
      new webpack.optimize.UglifyJsPlugin({
        compress: { warnings: false },
        sourceMap: false
      })
    )
  }

  const webpackConfig = {
    devtool: false,
    entry: {
      'static-bundle.js': requireFileName
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          include: [dotNextDir],
          loader: 'babel-loader',
          options: {
            babelrc: 'false'
          }
        }
      ]
    },
    plugins,
    resolve: {
      modules: [
        nextNodeModulesDir,
        'node_modules',
        ...nodePathList
      ]
    },
    output: {
      path: join(dir, '.next'),
      filename: '[name]',
      library: 'require',
      libraryTarget: 'var'
    }
  }

  const compiler = webpack(webpackConfig)
  await runCompiler(compiler)

  fs.unlinkSync(requireFileName)
}

function createRequireBundle (filename, staticModules) {
  let requireCode = `
    var cache = {}
    // We set react and react-dom to the cache by default
    cache['react'] = require('react')
    cache['react-dom'] = require('react-dom')

    // We also set the resolved path of react and react-dom to the cache
    // So, that allowed us to externalize resolved react/react-dom with
    // still supporting their resolved paths
    cache['${require.resolve('react')}'] = require('react')
    cache['${require.resolve('react-dom')}'] = require('react-dom')
  `
  staticModules.forEach((module) => {
    requireCode += `cache['${module}'] = require('${module}') \n`
  })

  requireCode += `
    module.exports = function(moduleName) {
      const m = cache[moduleName]
      if (!m) {
        throw new Error('Cannot find module: ' + moduleName)
      }

      return m
    }
  `

  fs.writeFileSync(filename, requireCode, 'utf8')
}
