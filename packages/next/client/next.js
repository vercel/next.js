import { initNext, version, router, emitter } from './'

window.next = {
  version,
  // router is initialized later so it has to be live-binded
  get router() {
    return router
  },
  emitter,
}

initNext().catch(console.error)
