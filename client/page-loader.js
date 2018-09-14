import PageLoader from '../lib/page-loader'

export function initPageLoader ({buildId, assetPrefix}) {
  const pageLoader = new PageLoader(buildId, assetPrefix)
  window.__NEXT_LOADED_PAGES__.forEach(({ route, fn }) => {
    pageLoader.registerPage(route, fn)
  })
  delete window.__NEXT_LOADED_PAGES__
  window.__NEXT_REGISTER_PAGE = pageLoader.registerPage.bind(pageLoader)
  return pageLoader
}
