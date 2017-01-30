import loaderUtils from 'loader-utils'
import { transform } from 'babel-core'

module.exports = function (content, sourceMap) {
  this.cacheable()

  const query = loaderUtils.parseQuery(this.query)
  const name = query.name || '[hash].[ext]'
  const context = query.context || this.options.context
  const regExp = query.regExp
  const opts = { context, content, regExp }
  const interpolatedName = loaderUtils.interpolateName(this, name, opts)

  const transpiled = transform(content, {
    presets: [
      'es2015'
    ],
    sourceMaps: 'both',
    inputSourceMap: sourceMap
  })

  this.emitFile(interpolatedName, transpiled.code, transpiled.map)
  this.callback(null, transpiled.code, transpiled.map)
}
