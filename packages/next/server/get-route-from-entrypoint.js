'use strict'
Object.defineProperty(exports, '__esModule', {
  value: true,
})
exports.default = getRouteFromEntrypoint
var _getRouteFromAssetPath = _interopRequireDefault(
  require('../shared/lib/router/utils/get-route-from-asset-path')
)
function _interopRequireDefault(obj) {
  return obj && obj.__esModule
    ? obj
    : {
        default: obj,
      }
}
// matches pages/:page*.js
const SERVER_ROUTE_NAME_REGEX = /^pages[/\\](.*)$/
// matches static/pages/:page*.js
const BROWSER_ROUTE_NAME_REGEX = /^static[/\\]pages[/\\](.*)$/
function matchBundle(regex, input) {
  const result = regex.exec(input)
  if (!result) {
    return null
  }
  return (0, _getRouteFromAssetPath).default(`/${result[1]}`)
}
function getRouteFromEntrypoint(entryFile) {
  let pagePath = matchBundle(SERVER_ROUTE_NAME_REGEX, entryFile)
  if (pagePath) {
    return pagePath
  }
  // Potentially the passed item is a browser bundle so we try to match that also
  return matchBundle(BROWSER_ROUTE_NAME_REGEX, entryFile)
}

//# sourceMappingURL=get-route-from-entrypoint.js.map
