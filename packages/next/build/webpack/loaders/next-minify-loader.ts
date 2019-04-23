import loaderUtils from 'loader-utils'
import { loader } from 'webpack'
import minify from '../plugins/terser-webpack-plugin/src/minify'

const nextMiniferLoader: loader.Loader = function(source) {
  this.cacheable()

  const options = loaderUtils.getOptions(this) || {}
  const { error, code } = minify({
    file: 'noop',
    input: source as string,
    terserOptions: { ...options.terserOptions, sourceMap: false },
  })

  if (error) {
    this.callback(new Error(`Error from Terser: ${error.message}`))
    return
  }
  this.callback(undefined, code)
  return
}

export default nextMiniferLoader
