// TODO: Remove use of `any` type.
import { initialize, version, router, emitter } from './'
import initWebpackHMR from './dev/webpack-hot-middleware-client'

import './setup-hydration-warning'
import { pageBootrap } from './page-bootstrap'
import { addMessageListener, sendMessage } from './dev/error-overlay/websocket'
//@ts-expect-error requires "moduleResolution": "node16" in tsconfig.json and not .ts extension
import { connect } from '@vercel/turbopack-ecmascript-runtime/dev/client/hmr-client.ts'

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

const webpackHMR = initWebpackHMR()
initialize({
  // TODO the prop name is confusing as related to webpack
  webpackHMR,
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

    connect({
      addMessageListener(cb: (msg: Record<string, string>) => void) {
        addMessageListener((msg) => {
          // Only call Turbopack's message listener for turbopack messages
          if (msg.type?.startsWith('turbopack-')) {
            cb(msg)
          }
        })
      },
      sendMessage,
    })

    return pageBootrap(assetPrefix)
  })
  .catch((err) => {
    console.error('Error was not caught', err)
  })
