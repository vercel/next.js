// TODO: Remove use of `any` type.
import { initialize, version, router, emitter } from './'
import initHMR from './dev/hot-middleware-client'

import { pageBootstrap } from './page-bootstrap'
//@ts-expect-error requires "moduleResolution": "node16" in tsconfig.json and not .ts extension
import { connect } from '@vercel/turbopack-ecmascript-runtime/browser/dev/hmr-client/hmr-client.ts'
import type { TurbopackMsgToBrowser } from '../server/dev/hot-reloader-types'

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

const devClient = initHMR()
initialize({
  devClient,
})
  .then(({ assetPrefix }) => {
    // This is only used in development mode. A special chunk is emitted for each page that contains the page's chunks.
    // This chunk is used to load the page's chunks in the browser on navigation.
    // In production, the page's chunks are loaded by the page loader using the build manifest.
    // The reason we need this in development is that the chunks are not known ahead of time.
    ;(self as any).__turbopack_load_page_chunks__ = (
      page: string,
      chunksData: any
    ) => {
      const chunkPromises = chunksData.map(__turbopack_load__)

      Promise.all(chunkPromises).catch((err) =>
        console.error('failed to load chunks for page ' + page, err)
      )
    }

    connect({
      addMessageListener(cb: (msg: TurbopackMsgToBrowser) => void) {
        devClient.addTurbopackMessageListener(cb)
      },
      sendMessage: devClient.sendTurbopackMessage,
      onUpdateError: devClient.handleUpdateError,
    })

    return pageBootstrap(assetPrefix)
  })
  .catch((err) => {
    console.error('Error was not caught', err)
  })
