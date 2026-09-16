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

type PageChunkData = string | { path: string }

// Map of page route -> promise that settles once the page's executable chunks
// finish loading. The route loader consumes these promises in production.
// Creating the map eagerly also lets the route loader detect Turbopack.
const turbopackPageChunkPromises = new Map<string, Promise<unknown>>()
;(self as any).__TURBOPACK_PAGE_CHUNK_PROMISES__ = turbopackPageChunkPromises

initialize({})
  .then(() => {
    // for the page loader
    ;(self as any).__turbopack_load_page_chunks__ = (
      page: string,
      chunksData: PageChunkData[]
    ) => {
      const chunkLoads = chunksData.map((chunkData) => ({
        chunkData,
        promise: __turbopack_load__(chunkData),
      }))

      // Preserve loading and error reporting for every chunk. CSS remains
      // subject to the route timeout, and the shared runtime is already active,
      // so only executable page chunks postpone that timeout.
      Promise.all(chunkLoads.map(({ promise }) => promise)).catch((err) =>
        console.error('failed to load chunks for page ' + page, err)
      )
      const chunksPromise = Promise.all(
        chunkLoads
          .filter(({ chunkData }) => {
            const chunkPath =
              typeof chunkData === 'string' ? chunkData : chunkData.path
            return (
              !chunkPath.endsWith('.css') &&
              !/(?:^|\/)turbopack-[^/]+\.js$/.test(chunkPath)
            )
          })
          .map(({ promise }) => promise)
      ).catch(() => {})
      turbopackPageChunkPromises.set(page, chunksPromise)
    }

    return hydrate()
  })
  .catch((err) => {
    console.error('Error was not caught', err)
  })
