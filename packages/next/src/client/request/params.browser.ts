export const createRenderParamsFromClient =
  process.env.NODE_ENV === 'development'
    ? (require('./params.browser.dev') as typeof import('./params.browser.dev'))
        .makeDynamicallyTrackedExoticParamsWithDevWarnings
    : (
        require('./params.browser.prod') as typeof import('./params.browser.prod')
      ).makeUntrackedExoticParams
