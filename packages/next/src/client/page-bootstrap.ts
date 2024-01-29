import { hydrate, router } from './'
import initOnDemandEntries from './dev/on-demand-entries-client'
import initializeBuildWatcher from './dev/dev-build-watcher'
import type { ShowHideHandler } from './dev/dev-build-watcher'
import { displayContent } from './dev/fouc'
import { connectHMR, addMessageListener } from './dev/error-overlay/websocket'
import {
  assign,
  urlQueryToSearchParams,
} from '../shared/lib/router/utils/querystring'
import { HMR_ACTIONS_SENT_TO_BROWSER } from '../server/dev/hot-reloader-types'

export function pageBootrap(assetPrefix: string) {
  connectHMR({ assetPrefix, path: '/_next/webpack-hmr' })

  return hydrate({ beforeRender: displayContent }).then(() => {
    initOnDemandEntries()

    let buildIndicatorHandler: ShowHideHandler | undefined

    if (process.env.__NEXT_BUILD_INDICATOR) {
      initializeBuildWatcher((handler) => {
        buildIndicatorHandler = handler
      }, process.env.__NEXT_BUILD_INDICATOR_POSITION)
    }

    let reloading = false

    addMessageListener((payload) => {
      if (reloading) return
      if ('action' in payload) {
        if (payload.action === HMR_ACTIONS_SENT_TO_BROWSER.SERVER_ERROR) {
          const { stack, message } = JSON.parse(payload.errorJSON)
          const error = new Error(message)
          error.stack = stack
          throw error
        } else if (payload.action === HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE) {
          reloading = true
          window.location.reload()
        } else if (
          payload.action ===
          HMR_ACTIONS_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE
        ) {
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
        }
      } else if ('event' in payload) {
        if (payload.event === HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES) {
          return window.location.reload()
        } else if (
          payload.event === HMR_ACTIONS_SENT_TO_BROWSER.CLIENT_CHANGES
        ) {
          const isOnErrorPage = window.next.router.pathname === '/_error'
          // On the error page we want to reload the page when a page was changed
          if (isOnErrorPage) {
            return window.location.reload()
          }
        } else if (
          payload.event === HMR_ACTIONS_SENT_TO_BROWSER.SERVER_ONLY_CHANGES
        ) {
          const { pages } = payload

          // Make sure to reload when the dev-overlay is showing for an
          // API route
          // TODO: Fix `__NEXT_PAGE` type
          if (pages.includes(router.query.__NEXT_PAGE as string)) {
            return window.location.reload()
          }

          if (!router.clc && pages.includes(router.pathname)) {
            console.log('Refreshing page data due to server-side change')

            buildIndicatorHandler?.show()

            const clearIndicator = () => buildIndicatorHandler?.hide()

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
        }
      }
    })
  })
}
