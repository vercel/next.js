import loaderUtils from 'loader-utils'
import { loader } from 'webpack'

import minify from '../plugins/terser-webpack-plugin/src/minify'

const nextMiniferLoader: loader.Loader = function(source, inputSourceMap) {
  this.cacheable()

  const strSource = source instanceof Buffer ? source.toString('utf8') : source

  const options = loaderUtils.getOptions(this) || {}
  const { error, code } = minify({
    file: options.file || 'noop.js',
    input: strSource,
    terserOptions: {
      ...options.terserOptions,
      // Detect if webpack source maps are on and enable Terser support,
      // overriding whatever was sent.
      sourceMap: !!inputSourceMap,
    },
  })

  if (error) {
    this.callback(new Error(`Error from Terser: ${error.message}`))
    return
  }

  // TODO: source map support
  this.callback(undefined, code)
  return
}

export default nextMiniferLoader
