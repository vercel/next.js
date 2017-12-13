// Order from most specific to least specific

const routes = {
  '/': { page: '/' },
  '/docs/': { page: '/', query: { id: 'docs' } },
  '/examples/': { page: '/', query: { id: 'examples' } },
  '/editor/': { page: '/editor' }
}

function orderedRoutes () {
  const pathnames = Object.keys(routes).sort(
    (a, b) => a.split('/').length < b.split('/').length
  )

  return pathnames.map(pathname => ({
    pathname,
    ...routes[pathname]
  }))
}

function exportPathMap () {
  return routes
}

module.exports = {
  exportPathMap,
  orderedRoutes
}
