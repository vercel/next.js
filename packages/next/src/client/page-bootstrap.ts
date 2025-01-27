import { hydrate, router } from './'
import initOnDemandEntries from './dev/on-demand-entries-client'
import { devBuildIndicator } from './dev/dev-build-indicator/internal/dev-build-indicator'
import { displayContent } from './dev/fouc'
import {
  connectHMR,
  addMessageListener,
} from './components/react-dev-overlay/pages/websocket'
import {
  assign,
  urlQueryToSearchParams,
} from '../shared/lib/router/utils/querystring'
import { HMR_ACTIONS_SENT_TO_BROWSER } from '../server/dev/hot-reloader-types'
import { RuntimeErrorHandler } from './components/errors/runtime-error-handler'
import { REACT_REFRESH_FULL_RELOAD_FROM_ERROR } from './components/react-dev-overlay/shared'
import { performFullReload } from './components/react-dev-overlay/pages/hot-reloader-client'
import { initializeDevBuildIndicatorForPageRouter } from './dev/dev-build-indicator/initialize-for-page-router'

export function pageBootstrap(assetPrefix: string) {
  connectHMR({ assetPrefix, path: '/_next/webpack-hmr' })

  return hydrate({ beforeRender: displayContent }).then(() => {
    initOnDemandEntries()

    initializeDevBuildIndicatorForPageRouter()

    let reloading = false

    addMessageListener((payload) => {
      if (reloading) return
      if ('action' in payload) {
        switch (payload.action) {
          case HMR_ACTIONS_SENT_TO_BROWSER.SERVER_ERROR: {
            const { stack, message } = JSON.parse(payload.errorJSON)
            const error = new Error(message)
            error.stack = stack
            throw error
          }
          case HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE: {
            reloading = true
            window.location.reload()
            break
          }
          case HMR_ACTIONS_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE: {
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
          default:
            break
        }
      } else if ('event' in payload) {
        switch (payload.event) {
          case HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES: {
            return window.location.reload()
          }
          case HMR_ACTIONS_SENT_TO_BROWSER.CLIENT_CHANGES: {
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
          case HMR_ACTIONS_SENT_TO_BROWSER.SERVER_ONLY_CHANGES: {
            if (RuntimeErrorHandler.hadRuntimeError) {
              console.warn(REACT_REFRESH_FULL_RELOAD_FROM_ERROR)
              performFullReload(null)
            }

            const { pages } = payload

            // Make sure to reload when the dev-overlay is showing for an
            // API route
            // TODO: Fix `__NEXT_PAGE` type
            if (pages.includes(router.query.__NEXT_PAGE as string)) {
              return window.location.reload()
            }

            if (!router.clc && pages.includes(router.pathname)) {
              console.log('Refreshing page data due to server-side change')
              devBuildIndicator.show()
              const clearIndicator = () => devBuildIndicator.hide()

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
          default:
            break
        }
      }
    })
  })
}
