import { initialize, hydrate, version, router, emitter } from './'
import initOnDemandEntries from './dev/on-demand-entries-client'
import initWebpackHMR from './dev/webpack-hot-middleware-client'
import initializeBuildWatcher from './dev/dev-build-watcher'
import { displayContent } from './dev/fouc'
import { connectHMR, addMessageListener } from './dev/error-overlay/websocket'
import {
  assign,
  urlQueryToSearchParams,
} from '../shared/lib/router/utils/querystring'

if (!window._nextSetupHydrationWarning) {
  const origConsoleError = window.console.error
  window.console.error = (...args) => {
    const isHydrateError = args.some(
      (arg) =>
        typeof arg === 'string' &&
        arg.match(/Warning:.*?did not match.*?Server:/)
    )
    if (isHydrateError) {
      args = [
        ...args,
        `\n\nSee more info here: https://nextjs.org/docs/messages/react-hydration-error`,
      ]
    }
    origConsoleError.apply(window.console, args)
  }
  window._nextSetupHydrationWarning = true
}

window.next = {
  version,
  // router is initialized later so it has to be live-binded
  get router() {
    return router
  },
  emitter,
}

const webpackHMR = initWebpackHMR()
initialize({ webpackHMR })
  .then(({ assetPrefix }) => {
    connectHMR({ assetPrefix, path: '/_next/webpack-hmr' })

    return hydrate({ beforeRender: displayContent }).then(() => {
      initOnDemandEntries()

      let buildIndicatorHandler = () => {}

      function devPagesManifestListener(event) {
        if (event.data.indexOf('devPagesManifest') !== -1) {
          fetch(
            `${assetPrefix}/_next/static/development/_devPagesManifest.json`
          )
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
                router.asPath,
                { scroll: false }
              )
              .finally(clearIndicator)
          }
        }
      }
      addMessageListener(devPagesManifestListener)

      if (process.env.__NEXT_BUILD_INDICATOR) {
        initializeBuildWatcher((handler) => {
          buildIndicatorHandler = handler
        }, process.env.__NEXT_BUILD_INDICATOR_POSITION)
      }
    })
  })
  .catch((err) => {
    console.error('Error was not caught', err)
  })
