// TODO: Remove use of `any` type.
import { initialize, hydrate, version, router, emitter } from './'
import { displayContent } from './dev/fouc'

import './setup-hydration-warning'

window.next = {
  version: `${version}-turbo`,
  // router is initialized later so it has to be live-binded
  get router() {
    return router
  },
  emitter,
}
;(self as any).__next_set_public_path__ = () => {}

// for the page loader
declare let __turbopack_load__: any

initialize({
  // TODO the prop name is confusing as related to webpack
  webpackHMR: {
    onUnrecoverableError() {},
  },
})
  .then(({ assetPrefix }) => {
    // for the page loader
    async function loadPageChunk(chunkData: any) {
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

    ;(self as any).__turbopack_load_page_chunks__ = (
      page: string,
      chunksData: any
    ) => {
      const chunkPromises = chunksData.map(loadPageChunk)

      Promise.all(chunkPromises).catch((err) =>
        console.error('failed to load chunks for page ' + page, err)
      )
    }

    return hydrate({ beforeRender: displayContent }).then(() => {})
  })
  .catch((err) => {
    console.error('Error was not caught', err)
  })
