/**
 * This is the runtime entry point for Next.js Page Router client-side bundles.
 */

import '../shims'
import { initialize, hydrate, version, router, emitter } from 'next/dist/client'

declare global {
  interface Window {
    next: any
  }
}

window.next = {
  version: `${version}-turbo`,
  // router is initialized later so it has to be live-binded
  get router() {
    return router
  },
  emitter,
}
;(self as any).__next_set_public_path__ = () => {}

initialize({})
  .then(() => hydrate())
  .catch(console.error)
