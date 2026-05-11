// A client-side entry point for Turbopack builds. Includes logic to load chunks,
// but does not include development-time features like hot module reloading.

import './register-deployment-id-global'
import '../lib/require-instrumentation-client'

// TODO: Remove use of `any` type.
import { initialize, version, router, emitter, hydrate } from './'

window.next = {
  version,
  turbopack: true,
  // router is initialized later so it has to be live-binded
  get router() {
    return router
  },
  emitter,
}
;(self as any).__next_set_public_path__ = () => {}
;(self as any).__webpack_hash__ = ''

// for the page loader
declare let __turbopack_load__: any

initialize({})
  .then(() => {
    // for the page loader
    ;(self as any).__turbopack_load_page_chunks__ = (
      page: string,
      chunksData: any
    ) => {
      const chunkPromises = chunksData.map((c: unknown) =>
        __turbopack_load__(c)
      )

      const chunksPromise = Promise.all(chunkPromises).catch((err) =>
        console.error('failed to load chunks for page ' + page, err)
      )

      // Expose the chunk-loading promise so the route loader can avoid
      // timing out a route while its chunks are still being downloaded.
      // See packages/next/src/client/route-loader.ts.
      const map = ((self as any).__TURBOPACK_PAGE_CHUNK_PROMISES__ ??=
        new Map())
      map.set(page, chunksPromise)
    }

    return hydrate()
  })
  .catch((err) => {
    console.error('Error was not caught', err)
  })
