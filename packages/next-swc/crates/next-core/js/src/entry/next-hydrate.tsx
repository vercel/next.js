import '../internal/shims-client'

import { initialize, hydrate, router, emitter, version } from 'next/dist/client'
import type { Router } from 'next/dist/client/router'
import {
  assign,
  urlQueryToSearchParams,
} from 'next/dist/shared/lib/router/utils/querystring'
import { formatWithValidation } from 'next/dist/shared/lib/router/utils/format-url'
import { initializeHMR } from '../dev/client'
import { subscribeToUpdate } from '@vercel/turbopack-ecmascript-runtime/dev/client/hmr-client'

async function loadPageChunk(assetPrefix: string, chunkData: ChunkData) {
  if (typeof chunkData === 'string') {
    const fullPath = assetPrefix + chunkData

    await __turbopack_load__(fullPath)
  } else {
    let fullChunkData = {
      ...chunkData,
      path: assetPrefix + chunkData.path,
    }

    await __turbopack_load__(fullChunkData)
  }
}

;(async () => {
  console.debug('Initializing Next.js')

  window.next = {
    version: version || '',
    get router() {
      return router
    },
    emitter,
  }

  const { assetPrefix } = await initialize({
    webpackHMR: {
      // Expected when `process.env.NODE_ENV === 'development'`
      onUnrecoverableError() {},
    },
  })

  initializeHMR({
    assetPrefix,
  })

  // for the page loader
  window.__turbopack_load_page_chunks__ = (page, chunksData) => {
    const chunkPromises = chunksData.map(loadPageChunk.bind(null, assetPrefix))

    Promise.all(chunkPromises).catch((err) =>
      console.error('failed to load chunks for page ' + page, err)
    )
  }

  const pagePath = window.__NEXT_DATA__.page
  window.__NEXT_P.push([
    '/_app',
    () => require('@vercel/turbopack-next/pages/_app'),
  ])
  window.__NEXT_P.push([pagePath, () => require('PAGE')])

  console.debug('Hydrating the page')

  await hydrate({})

  // This needs to happen after hydration because the router is initialized
  // during hydration. To make this dependency clearer, we pass `router` as an
  // explicit argument instead of relying on the `router` import binding.
  subscribeToCurrentPageData({ assetPrefix, router })
  subscribeToPageManifest({ assetPrefix })

  console.debug('The page has been hydrated')
})().catch((err) => console.error(err))

function subscribeToPageManifest({ assetPrefix }: { assetPrefix: string }) {
  // adapted from https://github.com/vercel/next.js/blob/836ac9cc7f290e95b564a61341fa95a5f4f0327e/packages/next/src/client/next-dev.ts#L57
  subscribeToUpdate(
    {
      path: '_next/static/development/_devPagesManifest.json',
    },
    (update) => {
      if (['restart', 'notFound', 'partial'].includes(update.type)) {
        return
      }

      fetch(`${assetPrefix}/_next/static/development/_devPagesManifest.json`)
        .then((res) => res.json())
        .then((manifest) => {
          window.__DEV_PAGES_MANIFEST = manifest
        })
        .catch((err) => {
          console.log(`Failed to fetch devPagesManifest`, err)
        })
    }
  )
}

/**
 * Subscribes to the current page's data updates from the HMR server.
 *
 * Updates on route change.
 */
function subscribeToCurrentPageData({
  router,
  assetPrefix,
}: {
  router: Router
  assetPrefix: string
}) {
  let dataPath = getCurrentPageDataHref()
  let unsubscribe = subscribeToPageData({
    router,
    dataPath,
    assetPrefix,
  })

  router.events.on('routeChangeComplete', () => {
    const nextDataPath = getCurrentPageDataHref()
    if (dataPath === nextDataPath) {
      return
    }
    dataPath = nextDataPath

    unsubscribe()
    unsubscribe = subscribeToPageData({
      router,
      dataPath,
      assetPrefix,
    })
  })
}

function getCurrentPageDataHref(): string {
  return router.pageLoader.getDataHref({
    asPath: router.asPath,
    href: formatWithValidation({
      // No need to pass `router.query` when `skipInterpolation` is true.
      pathname: router.pathname,
    }),
    skipInterpolation: true,
  })
}

/**
 * TODO(alexkirsz): Handle assetPrefix/basePath.
 */
function subscribeToPageData({
  router,
  dataPath,
  assetPrefix,
}: {
  router: Router
  dataPath: string
  assetPrefix: string
}): () => void {
  return subscribeToUpdate(
    {
      // We need to remove the leading / from the data path as Turbopack
      // resources are not prefixed with a /.
      path: dataPath.slice(1),
      headers: {
        // This header is used by the Next.js server to determine whether this
        // is a data request.
        'x-nextjs-data': '1',
      },
    },
    (update) => {
      if (update.type !== 'restart') {
        return
      }

      // This triggers a reload of the page data.
      // Adapted from next.js/packages/next/client/next-dev.js.
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
    }
  )
}
