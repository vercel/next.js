'use client'

import ReactDOM from 'react-dom'

// NOTE: atm preload/prefetch/prefetchDNS are only supported in the SSR and client, not in RSC yet
export default function Client() {
  ReactDOM.preload('/api/preload', { as: 'script' })
  // @ts-ignore
  ReactDOM.preconnect('/preconnect-url', { crossOrigin: 'use-credentials' })
  // @ts-ignore
  ReactDOM.prefetchDNS('/dns-prefetch-url')
  return null
}
