/* globals __REPLACE_NOOP_IMPORT__ */
import { initNext, version, router, emitter, render, renderError } from './'
import initOnDemandEntries from './dev/on-demand-entries-client'
import initWebpackHMR from './dev/webpack-hot-middleware-client'
import initializeBuildWatcher from './dev/dev-build-watcher'
import { displayContent } from './dev/fouc'
import { connectHMR, addMessageListener } from './dev/error-overlay/websocket'
import {
  assign,
  urlQueryToSearchParams,
} from '../shared/lib/router/utils/querystring'

// Temporary workaround for the issue described here:
// https://github.com/vercel/next.js/issues/3775#issuecomment-407438123
// The runtimeChunk doesn't have dynamic import handling code when there hasn't been a dynamic import
// The runtimeChunk can't hot reload itself currently to correct it when adding pages using on-demand-entries
// eslint-disable-next-line no-unused-expressions
__REPLACE_NOOP_IMPORT__

const {
  __NEXT_DATA__: { assetPrefix },
} = window

const prefix = assetPrefix || ''
const webpackHMR = initWebpackHMR()

connectHMR({ path: `${prefix}/_next/webpack-hmr` })

window.next = {
  version,
  // router is initialized later so it has to be live-binded
  get router() {
    return router
  },
  emitter,
  render,
  renderError,
}
initNext({ webpackHMR })
  .then(({ renderCtx }) => {
    initOnDemandEntries()

    let buildIndicatorHandler = () => {}

    function devPagesManifestListener(event) {
      if (event.data.indexOf('devPagesManifest') !== -1) {
        fetch(`${prefix}/_next/static/development/_devPagesManifest.json`)
          .then((res) => res.json())
          .then((manifest) => {
            window.__DEV_PAGES_MANIFEST = manifest
          })
          .catch((err) => {
            console.log(`Failed to fetch devPagesManifest`, err)
          })
      } else if (event.data.indexOf('middlewareChanges') !== -1) {
        return window.location.reload()
      } else if (event.data.indexOf('serverOnlyChanges') !== -1) {
        const { pages } = JSON.parse(event.data)

        // Make sure to reload when the dev-overlay is showing for an
        // API route
        if (pages.includes(router.query.__NEXT_PAGE)) {
          return window.location.reload()
        }

        if (!router.clc && pages.includes(router.pathname)) {
          console.log('Refreshing page data due to server-side change')

          buildIndicatorHandler('building')

          const clearIndicator = () => buildIndicatorHandler('built')

          router
            .replace(
              router.pathname +
                '?' +
                String(
                  assign(
                    urlQueryToSearchParams(router.query),
                    new URLSearchParams(location.search)
                  )
                ),
              router.asPath
            )
            .finally(clearIndicator)
        }
      }
    }
    addMessageListener(devPagesManifestListener)

    if (process.env.__NEXT_BUILD_INDICATOR) {
      initializeBuildWatcher((handler) => {
        buildIndicatorHandler = handler
      })
    }

    // delay rendering until after styles have been applied in development
    displayContent(() => {
      render(renderCtx)
    })
  })
  .catch((err) => {
    console.error('Error was not caught', err)
  })
