import { resolve, relative } from 'path'

module.exports = function (content) {
  this.cacheable()

  const route = getRoute(this)

  return `${content}
    if (module.hot) {
      module.hot.accept()

      var Component = module.exports.default || module.exports
      Component.__route = ${JSON.stringify(route)}

      if (module.hot.status() !== 'idle') {
        var components = next.router.components
        for (var r in components) {
          if (!components.hasOwnProperty(r)) continue

          if (components[r].Component.__route === ${JSON.stringify(route)}) {
            next.router.update(r, Component)
          }
        }
      }
    }
  `
}

const nextPagesDir = resolve(__dirname, '..', '..', '..', 'pages')

function getRoute (loaderContext) {
  const pagesDir = resolve(loaderContext.options.context, 'pages')
  const { resourcePath } = loaderContext
  const dir = [pagesDir, nextPagesDir]
  .find((d) => resourcePath.indexOf(d) === 0)
  const path = relative(dir, resourcePath)
  return '/' + path.replace(/((^|\/)index)?\.js$/, '')
}
