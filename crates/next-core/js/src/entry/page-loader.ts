/// <reference types="next/client" />

// inserted by rust code
declare const PAGE_PATH: string

  // Adapted from https://github.com/vercel/next.js/blob/b7f9f1f98fc8ab602e84825105b5727272b72e7d/packages/next/src/build/webpack/loaders/next-client-pages-loader.ts
;(window.__NEXT_P = window.__NEXT_P || []).push([
  PAGE_PATH,
  () => {
    return require('PAGE')
  },
])
// @ts-expect-error module.hot exists
if (module.hot) {
  // @ts-expect-error module.hot exists
  module.hot.dispose(function () {
    window.__NEXT_P.push([PAGE_PATH])
  })
}
