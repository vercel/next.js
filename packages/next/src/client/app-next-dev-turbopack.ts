// TODO-APP: hydration warning

import { appBootstrap } from './app-bootstrap'
import { connect } from 'next/dist/compiled/@vercel/turbopack-ecmascript-runtime'
import { addMessageListener, sendMessage } from './dev/error-overlay/websocket'

window.next.version += '-turbo'

appBootstrap(() => {
  connect({
    addMessageListener(cb: (msg: Record<string, string>) => void) {
      addMessageListener((msg) => {
        // Only call Turbopack's message listener for turbopack messages
        if (msg.type?.startsWith('turbopack-')) {
          cb(msg)
        }
      })
    },
    sendMessage,
  })

  require('./app-turbopack')
  const { hydrate } = require('./app-index')
  hydrate()
})

// TODO-APP: build indicator
