// @flow
import { relative } from 'path'
import loaderUtils from 'loader-utils'

type Options = {|
  extensions: RegExp,
  include: Array<string>
|}

module.exports = function (content: string, sourceMap: any) {
  this.cacheable()

  const options: Options = loaderUtils.getOptions(this)
  const route = getRoute(this.resourcePath, options)

  // Webpack has a built in system to prevent default from colliding, giving it a random letter per export.
  // We can safely check if Component is undefined since all other pages imported into the entrypoint don't have __webpack_exports__.default
  this.callback(null, `${content}
    (function (Component, route) {
      if(!Component) return
      if (!module.hot) return
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
    })(typeof __webpack_exports__ !== 'undefined' ? __webpack_exports__.default : (module.exports.default || module.exports), ${JSON.stringify(route)})
  `, sourceMap)
}

function getRoute (resourcePath: string, options: Options) {
  if (!options.extensions) {
    throw new Error('extensions is not provided to hot-self-accept-loader. Please upgrade all next-plugins to the latest version.')
  }

  if (!options.include) {
    throw new Error('include option is not provided to hot-self-accept-loader. Please upgrade all next-plugins to the latest version.')
  }

  const dir = options.include.find((d) => resourcePath.indexOf(d) === 0)

  if (!dir) {
    throw new Error(`'hot-self-accept-loader' was called on a file that isn't a page.`)
  }

  const path = relative(dir, resourcePath).replace(options.extensions, '.js')
  return '/' + path.replace(/((^|\/)index)?\.js$/, '')
}
