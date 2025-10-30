import '../lib/require-instrumentation-client'
import { hydrate, router } from './'
import initOnDemandEntries from './dev/on-demand-entries-client'
import { displayContent } from './dev/fouc'
import {
  connectHMR,
  addMessageListener,
} from './dev/hot-reloader/pages/websocket'
import {
  assign,
  urlQueryToSearchParams,
} from '../shared/lib/router/utils/querystring'
import { HMR_MESSAGE_SENT_TO_BROWSER } from '../server/dev/hot-reloader-types'
import { RuntimeErrorHandler } from './dev/runtime-error-handler'
import { REACT_REFRESH_FULL_RELOAD_FROM_ERROR } from './dev/hot-reloader/shared'
import { performFullReload } from './dev/hot-reloader/pages/hot-reloader-pages'
import { dispatcher } from 'next/dist/compiled/next-devtools'

export function pageBootstrap(assetPrefix: string) {
  connectHMR({ assetPrefix, path: '/_next/webpack-hmr' })

  return hydrate({ beforeRender: displayContent }).then(() => {
    initOnDemandEntries()

    let reloading = false

    addMessageListener((message) => {
      if (reloading) return

      switch (message.type) {
        case HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ERROR: {
          const errorObject = JSON.parse(message.errorJSON)
          const error = new Error(errorObject.message)
          error.stack = errorObject.stack
          throw error
        }
        case HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE: {
          reloading = true
          window.location.reload()
          break
        }
        case HMR_MESSAGE_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE: {
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
          break
        }
        case HMR_MESSAGE_SENT_TO_BROWSER.MIDDLEWARE_CHANGES: {
          return window.location.reload()
        }
        case HMR_MESSAGE_SENT_TO_BROWSER.CLIENT_CHANGES: {
          // This is used in `../server/dev/turbopack-utils.ts`.
          const isOnErrorPage = window.next.router.pathname === '/_error'
          // On the error page we want to reload the page when a page was changed
          if (isOnErrorPage) {
            if (RuntimeErrorHandler.hadRuntimeError) {
              console.warn(REACT_REFRESH_FULL_RELOAD_FROM_ERROR)
            }
            reloading = true
            performFullReload(null)
          }
          break
        }
        case HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ONLY_CHANGES: {
          if (RuntimeErrorHandler.hadRuntimeError) {
            console.warn(REACT_REFRESH_FULL_RELOAD_FROM_ERROR)
            performFullReload(null)
          }

          const { pages } = message

          // Make sure to reload when the dev-overlay is showing for an
          // API route
          // TODO: Fix `__NEXT_PAGE` type
          if (pages.includes(router.query.__NEXT_PAGE as string)) {
            return window.location.reload()
          }

          if (!router.clc && pages.includes(router.pathname)) {
            console.log('Refreshing page data due to server-side change')
            dispatcher.buildingIndicatorShow()
            const clearIndicator = dispatcher.buildingIndicatorHide

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
              .catch(() => {
                // trigger hard reload when failing to refresh data
                // to show error overlay properly
                location.reload()
              })
              .finally(clearIndicator)
          }
          break
        }
        case HMR_MESSAGE_SENT_TO_BROWSER.ADDED_PAGE:
        case HMR_MESSAGE_SENT_TO_BROWSER.REMOVED_PAGE:
        case HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES:
        case HMR_MESSAGE_SENT_TO_BROWSER.SYNC:
        case HMR_MESSAGE_SENT_TO_BROWSER.BUILT:
        case HMR_MESSAGE_SENT_TO_BROWSER.BUILDING:
        case HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_MESSAGE:
        case HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_CONNECTED:
        case HMR_MESSAGE_SENT_TO_BROWSER.ISR_MANIFEST:
        case HMR_MESSAGE_SENT_TO_BROWSER.DEVTOOLS_CONFIG:
        case HMR_MESSAGE_SENT_TO_BROWSER.REACT_DEBUG_CHUNK:
        case HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_CURRENT_ERROR_STATE:
        case HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_PAGE_METADATA:
        case HMR_MESSAGE_SENT_TO_BROWSER.CACHE_INDICATOR:
          // Most of these action types are handled in
          // src/client/dev/hot-reloader/pages/hot-reloader-pages.ts and
          // src/client/dev/hot-reloader/app/hot-reloader-app.tsx
          break
        default:
          message satisfies never
      }
    })
  })
}
