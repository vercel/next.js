import { resolve, relative } from 'path'
import getConfig from '../../config'

module.exports = function (content, sourceMap) {
  this.cacheable()

  const route = getRoute(this)

  this.callback(null, `${content}
    (function (Component, route) {
      if (!module.hot) return
      if (!__resourceQuery) return

      var qs = require('querystring')
      var params = qs.parse(__resourceQuery.slice(1))
      if (params.entry == null) return

      module.hot.accept()
      Component.__route = route

      if (module.hot.status() === 'idle') return

      var components = next.router.components
      for (var r in components) {
        if (!components.hasOwnProperty(r)) continue

        if (components[r].Component.__route === route) {
          next.router.update(r, Component)
        }
      }
    })(module.exports.default || module.exports, ${JSON.stringify(route)})
  `, sourceMap)
}

const nextPagesDir = resolve(__dirname, '..', '..', '..', 'pages')

function getRoute (loaderContext) {
  const config = getConfig(loaderContext.options.context)
  const pagesDirectory = config.pagesDirectory
  const pagesDir = resolve(loaderContext.options.context, pagesDirectory)
  const { resourcePath } = loaderContext
  const dir = [pagesDir, nextPagesDir]
  .find((d) => resourcePath.indexOf(d) === 0)
  const path = relative(dir, resourcePath)
  return '/' + path.replace(/((^|\/)index)?\.js$/, '')
}
