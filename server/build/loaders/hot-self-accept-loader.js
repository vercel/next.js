import { resolve, relative } from 'path'

module.exports = function (content) {
  this.cacheable()

  const route = getRoute(this)

  return content + `
    if (module.hot) {
      module.hot.accept()
      if ('idle' !== module.hot.status()) {
        const Component = module.exports.default || module.exports
        next.router.update('${route}', Component)
      }
    }
  `
}

function getRoute (loaderContext) {
  const pagesDir = resolve(loaderContext.options.context, 'pages')
  const path = loaderContext.resourcePath
  return '/' + relative(pagesDir, path).replace(/((^|\/)index)?\.js$/, '')
}
