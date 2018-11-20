import { resolve, relative } from 'path'

module.exports = function (content, sourceMap) {
  this.cacheable()

  const route = getRoute(this)

  this.callback(null, `${content}
    require('next/page-loader').registerPage(${JSON.stringify(route)}, function() {
      return {
        page: typeof __webpack_exports__ !== 'undefined' ? __webpack_exports__.default : (module.exports.default || module.exports)
      }
    })
  `, sourceMap)
}

function getRoute (loaderContext) {
  const pagesDir = resolve(loaderContext.rootContext, 'pages')
  const { resourcePath } = loaderContext
  const path = relative(pagesDir, resourcePath)
  return '/' + path.replace(/((^|\/)index)?\.js$/, '')
}
