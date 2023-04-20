import * as page from 'PAGE'

// inserted by rust code
declare const PAGE_PATH: string

  // Adapted from https://github.com/vercel/next.js/blob/canary/packages/next/build/webpack/loaders/next-client-pages-loader.ts
;(window.__NEXT_P = window.__NEXT_P || []).push([
  PAGE_PATH,
  () => {
    return page
  },
])
if (module.hot) {
  module.hot.dispose(function () {
    window.__NEXT_P.push([PAGE_PATH])
  })
}
