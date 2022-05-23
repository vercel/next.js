import { init as initWebpack } from 'next/dist/compiled/webpack/webpack'

let installed: boolean = false

export function loadWebpackHook() {
  if (installed) {
    return
  }
  installed = true

  initWebpack()

  // hook the Node.js require so that webpack requires are
  // routed to the bundled and now initialized webpack version
  require('../build/webpack/require-hook')
}
