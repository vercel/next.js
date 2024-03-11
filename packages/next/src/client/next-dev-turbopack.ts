// TODO: Remove use of `any` type.
import { initialize, version, router, emitter } from './'
import initHMR from './dev/hot-middleware-client'

import './setup-hydration-warning'
import { pageBootrap } from './page-bootstrap'
//@ts-expect-error requires "moduleResolution": "node16" in tsconfig.json and not .ts extension
import { connect } from '@vercel/turbopack-ecmascript-runtime/dev/client/hmr-client.ts'
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

const devClient = initHMR('turbopack')
initialize({
  devClient,
})
  .then(({ assetPrefix }) => {
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

    connect({
      addMessageListener(cb: (msg: TurbopackMsgToBrowser) => void) {
        devClient.addTurbopackMessageListener(cb)
      },
      sendMessage: devClient.sendTurbopackMessage,
    })

    return pageBootrap(assetPrefix)
  })
  .catch((err) => {
    console.error('Error was not caught', err)
  })
