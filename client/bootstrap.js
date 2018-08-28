window.module = {}
window.__NEXT_DATA__ = JSON.parse(
  document
    .getElementById('server-app-state')
    .textContent.replace(/%3C\/script%3E/g, '</script>')
)
window.__NEXT_LOADED_PAGES__ = []
window.__NEXT_REGISTER_PAGE = function (route, fn) {
  window.__NEXT_LOADED_PAGES__.push({ route: route, fn: fn })
}
if (window.__NEXT_DATA__.page === '_error') {
  window.__NEXT_REGISTER_PAGE(window.__NEXT_DATA__.cleanPathname, function () {
    var error = new Error(`Page does not exist: ${window.__NEXT_DATA__.cleanPathname}`)
    error.statusCode = 404
    return { error: error }
  })
}
