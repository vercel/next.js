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

initialize({
  // TODO the prop name is confusing as related to webpack
  webpackHMR: {
    onUnrecoverableError() {},
  },
})
  .then(({ assetPrefix: _assetPrefix }) => {
    return hydrate({ beforeRender: displayContent }).then(() => {})
  })
  .catch((err) => {
    console.error('Error was not caught', err)
  })
