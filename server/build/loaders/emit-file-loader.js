import loaderUtils from 'loader-utils'

module.exports = function (content, sourceMap) {
  this.cacheable()

  const query = loaderUtils.getOptions(this)
  const name = query.name || '[hash].[ext]'
  const context = query.context || this.options.context
  const regExp = query.regExp
  const opts = { context, content, regExp }
  const interpolatedName = loaderUtils.interpolateName(this, name, opts)

  const emit = (code, map) => {
    this.emitFile(interpolatedName, code, map)
    this.callback(null, code, map)
  }

  if (query.transform) {
    const transformed = query.transform({ content, sourceMap, interpolatedName })
    return emit(transformed.content, transformed.sourceMap)
  }

  return emit(content, sourceMap)
}
