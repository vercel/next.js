import { initNext, version, router, emitter, render, renderError } from './'

window.next = {
  version,
  // router is initialized later so it has to be live-binded
  get router() {
    return router
  },
  emitter,
  render,
  renderError,
}

initNext().catch(console.error)
