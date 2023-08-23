import { hydrate, router } from './'
import initOnDemandEntries from './dev/on-demand-entries-client'
import initializeBuildWatcher from './dev/dev-build-watcher'
import { displayContent } from './dev/fouc'
import { connectHMR, addMessageListener } from './dev/error-overlay/websocket'
import {
  assign,
  urlQueryToSearchParams,
} from '../shared/lib/router/utils/querystring'

export function pageBootrap(assetPrefix: string) {
  connectHMR({ assetPrefix, path: '/_next/webpack-hmr' })

  return hydrate({ beforeRender: displayContent }).then(() => {
    initOnDemandEntries()

    let buildIndicatorHandler: (obj: Record<string, any>) => void = () => {}

    function devPagesHmrListener(payload: any) {
      if (payload.event === 'server-error' && payload.errorJSON) {
        const { stack, message } = JSON.parse(payload.errorJSON)
        const error = new Error(message)
        error.stack = stack
        throw error
      } else if (payload.action === 'reloadPage') {
        window.location.reload()
      } else if (payload.action === 'devPagesManifestUpdate') {
        fetch(`${assetPrefix}/_next/static/development/_devPagesManifest.json`)
          .then((res) => res.json())
          .then((manifest) => {
            window.__DEV_PAGES_MANIFEST = manifest
          })
          .catch((err) => {
            console.log(`Failed to fetch devPagesManifest`, err)
          })
      } else if (payload.event === 'middlewareChanges') {
        return window.location.reload()
      } else if (payload.event === 'serverOnlyChanges') {
        const { pages } = payload

        // Make sure to reload when the dev-overlay is showing for an
        // API route
        if (pages.includes(router.query.__NEXT_PAGE)) {
          return window.location.reload()
        }

        if (!router.clc && pages.includes(router.pathname)) {
          console.log('Refreshing page data due to server-side change')

          buildIndicatorHandler({ action: 'building' })

          const clearIndicator = () =>
            buildIndicatorHandler({ action: 'built' })

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
    addMessageListener(devPagesHmrListener)

    if (process.env.__NEXT_BUILD_INDICATOR) {
      initializeBuildWatcher((handler: any) => {
        buildIndicatorHandler = handler
      }, process.env.__NEXT_BUILD_INDICATOR_POSITION)
    }
  })
}
