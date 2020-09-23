/* globals __REPLACE_NOOP_IMPORT__ */
import initNext, * as next from './'
import EventSourcePolyfill from './dev/event-source-polyfill'
import initOnDemandEntries from './dev/on-demand-entries-client'
import initWebpackHMR from './dev/webpack-hot-middleware-client'
import initializeBuildWatcher from './dev/dev-build-watcher'
import initializePrerenderIndicator from './dev/prerender-indicator'
import initializeDevServerWatcher from './dev/dev-server-watcher'
import { displayContent } from './dev/fouc'
import { getEventSourceWrapper } from './dev/error-overlay/eventsource'
import * as querystring from '../next-server/lib/router/utils/querystring'

// Temporary workaround for the issue described here:
// https://github.com/vercel/next.js/issues/3775#issuecomment-407438123
// The runtimeChunk doesn't have dynamic import handling code when there hasn't been a dynamic import
// The runtimeChunk can't hot reload itself currently to correct it when adding pages using on-demand-entries
// eslint-disable-next-line no-unused-expressions
__REPLACE_NOOP_IMPORT__

// Support EventSource on Internet Explorer 11
if (!window.EventSource) {
  window.EventSource = EventSourcePolyfill
}

const {
  __NEXT_DATA__: { assetPrefix },
} = window

const prefix = assetPrefix || ''
const webpackHMR = initWebpackHMR({ assetPrefix: prefix })

window.next = next
initNext({ webpackHMR })
  .then(({ renderCtx, render }) => {
    initOnDemandEntries({ assetPrefix: prefix })

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
      } else if (event.data.indexOf('serverOnlyChanges') !== -1) {
        const { pages } = JSON.parse(event.data)
        const router = window.next.router

        if (pages.includes(router.pathname)) {
          console.log('Refreshing page data due to server-side change')

          buildIndicatorHandler('building')

          const clearIndicator = () => buildIndicatorHandler('built')

          router
            .replace(
              router.pathname +
                '?' +
                String(
                  querystring.assign(
                    querystring.urlQueryToSearchParams(router.query),
                    new URLSearchParams(location.search)
                  )
                ),
              router.asPath
            )
            .finally(clearIndicator)
        }
      }
    }
    devPagesManifestListener.unfiltered = true
    getEventSourceWrapper({}).addMessageListener(devPagesManifestListener)

    if (process.env.__NEXT_BUILD_INDICATOR) {
      initializeBuildWatcher((handler) => {
        buildIndicatorHandler = handler
      })
    }
    if (
      process.env.__NEXT_PRERENDER_INDICATOR &&
      // disable by default in electron
      !(typeof process !== 'undefined' && 'electron' in process.versions)
    ) {
      initializePrerenderIndicator()
    }
    if (process.env.__NEXT_DEV_SERVER_INDICATOR) initializeDevServerWatcher()

    // delay rendering until after styles have been applied in development
    displayContent(() => {
      render(renderCtx)
    })
  })
  .catch((err) => {
    console.error('Error was not caught', err)
  })
