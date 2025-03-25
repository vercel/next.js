export const createRenderSearchParamsFromClient =
  process.env.NODE_ENV === 'development'
    ? (
        require('./search-params.browser.dev') as typeof import('./search-params.browser.dev')
      ).makeUntrackedExoticSearchParamsWithDevWarnings
    : (
        require('./search-params.browser.prod') as typeof import('./search-params.browser.prod')
      ).makeUntrackedExoticSearchParams
