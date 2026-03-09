// TODO: Remove use of `any` type.
import './register-deployment-id-global'
import './webpack'
import { initialize, version, router, emitter } from './'
import initHMR from './dev/hot-middleware-client'
import { pageBootstrap } from './page-bootstrap'

if (
  process.env.NODE_ENV !== 'production' &&
  process.env.__NEXT_REACT_DEVTOOLS
) {
  require('../next-react-devtools/initialize') as typeof import('../next-react-devtools/initialize')
}

window.next = {
  version,
  // router is initialized later so it has to be live-binded
  get router() {
    return router
  },
  emitter,
}

const devClient = initHMR()
initialize({ devClient })
  .then(({ assetPrefix }) => {
    return pageBootstrap(assetPrefix)
  })
  .catch((err) => {
    console.error('Error was not caught', err)
  })
