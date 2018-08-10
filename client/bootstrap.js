import htmlescape from 'htmlescape'

const NextData = JSON.parse(
  document
    .getElementById('server-app-state')
    .textContent.replace(/%3C\/script%3E/g, '</script>')
)
window.__NEXT_DATA__ = NextData
window.__NEXT_LOADED_PAGES__ = []
window.__NEXT_REGISTER_PAGE = function (route, fn) {
  window.__NEXT_LOADED_PAGES__.push({ route: route, fn: fn })
}
if (NextData.page === '_error') {
  window.__NEXT_REGISTER_PAGE(htmlescape(NextData.pathname), function () {
    var error = new Error(`Page does not exist: ${htmlescape(NextData.pathname)}`)
    error.statusCode = 404
    return { error: error }
  })
}
