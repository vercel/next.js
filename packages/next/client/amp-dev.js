/* globals __webpack_hash__ */
import EventSourcePolyfill from './event-source-polyfill'
import { getEventSourceWrapper } from './dev-error-overlay/eventsource'

if (!window.EventSource) {
  window.EventSource = EventSourcePolyfill
}

const data = JSON.parse(document.getElementById('__NEXT_DATA__').textContent)
const { assetPrefix } = data

getEventSourceWrapper({
  path: `${assetPrefix || ''}/_next/webpack-hmr`
}).addMessageListener(event => {
  if (event.data === '\uD83D\uDC93') {
    return
  }

  try {
    const message = JSON.parse(event.data)

    if (message.action === 'sync' || message.action === 'built') {
      if (!message.hash) {
        return
      }

      /* eslint-disable-next-line camelcase */
      if (message.hash !== __webpack_hash__) {
        document.location.reload(true)
      }
    } else if (message.action === 'reloadPage') {
      document.location.reload(true)
    }
  } catch (ex) {
    console.warn('Invalid HMR message: ' + event.data + '\n' + ex)
  }
})
