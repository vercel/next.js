// TODO: Remove use of `any` type.
import './webpack'
import { initialize, version, router, emitter } from './'
import initHMR from './dev/hot-middleware-client'
import { pageBootrap } from './page-bootstrap'

import './setup-hydration-warning'

window.next = {
  version,
  // router is initialized later so it has to be live-binded
  get router() {
    return router
  },
  emitter,
}

const devClient = initHMR('webpack')
initialize({ devClient })
  .then(({ assetPrefix }) => {
    return pageBootrap(assetPrefix)
  })
  .catch((err) => {
    console.error('Error was not caught', err)
  })
