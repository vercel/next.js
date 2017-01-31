import getConfig from '../config'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import UUID from 'uuid'
import webpack from 'webpack'
import { runCompiler } from './'

const nextNodeModulesDir = join(__dirname, '..', '..', '..', 'node_modules')
const nodePathList = (process.env.NODE_PATH || '')
  .split(process.platform === 'win32' ? ';' : ':')
  .filter((p) => !!p)

export default async function createStaticBundle (dir, { dev = false } = {}) {
  const config = getConfig(dir)
  const { bundleModules } = config
  if (!bundleModules) return

  // TODO: Use a proper file for this
  const requireFileName = join(dir, `${UUID.v4()}.js`)
  createRequireBundle(requireFileName, bundleModules)

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
    devtool: dev ? 'inline-source-map' : false,
    entry: {
      'static-bundle.js': requireFileName
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          include: ['/tmp'],
          loader: 'babel-loader',
          options: {
            babelrc: 'false',
            presets: ['es2015']
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

  unlinkSync(requireFileName)
}

function createRequireBundle (filename, bundleModules) {
  let requireCode = `
    var cache = {}
  `
  bundleModules.forEach((module) => {
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

  writeFileSync(filename, requireCode, 'utf8')
}
