import loaderUtils from 'loader-utils'

module.exports = function (content) {
  this.cacheable()

  const query = loaderUtils.parseQuery(this.query)
  const name = query.name || '[hash].[ext]'
  const context = query.context || this.options.context
  const regExp = query.regExp
  const opts = { context, content, regExp }
  const interpolatedName = loaderUtils.interpolateName(this, name, opts)

  this.emitFile(interpolatedName, content)

  return content
}
