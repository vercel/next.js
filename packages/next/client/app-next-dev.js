import { hydrate, version } from './app-index'
import {
  connectHMR /*, addMessageListener */,
} from './dev/error-overlay/websocket'
import connect from './app-dev/error-overlay/hot-dev-client'

// TODO: implement FOUC guard

// TODO: hydration warning

window.next = {
  version,
  appDir: true,
}

// TODO: implement assetPrefix support
connectHMR({ assetPrefix: '', path: '/_next/webpack-hmr', log: true })
connect()

hydrate()

// TODO: build indicator
