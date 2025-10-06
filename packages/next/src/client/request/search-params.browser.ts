export const createRenderSearchParamsFromClient =
  process.env.NODE_ENV === 'development'
    ? (
        require('./search-params.browser.dev') as typeof import('./search-params.browser.dev')
      ).createRenderSearchParamsFromClient
    : (
        require('./search-params.browser.prod') as typeof import('./search-params.browser.prod')
      ).createRenderSearchParamsFromClient
