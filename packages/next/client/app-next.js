import { hydrate, version } from './app-index'

// Include app-router and layout-router in the main chunk
import 'next/dist/client/components/app-router.client.js'
import 'next/dist/client/components/layout-router.client.js'

window.next = {
  version,
  appDir: true,
}

hydrate()
