// TODO: Remove use of `any` type.
import { initialize, version, router, emitter, hydrate } from './'

window.next = {
  version: `${version}-turbo`,
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
      const chunkPromises = chunksData.map(__turbopack_load__)

      Promise.all(chunkPromises).catch((err) =>
        console.error('failed to load chunks for page ' + page, err)
      )
    }

    return hydrate()
  })
  .catch((err) => {
    console.error('Error was not caught', err)
  })
