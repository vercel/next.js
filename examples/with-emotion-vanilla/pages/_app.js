import * as React from 'react'
import { hydrate } from '@emotion/css'

// Adds server generated styles to emotion cache.
// this needs to come before the app mounts
// We use query selector here as setting on window results in emotion error `Cannot read property 'forEach' of undefined`
if (typeof window !== 'undefined') {
  const ids = JSON.parse(
    document
      .querySelector('[data-emotion-ssr]')
      .getAttribute('data-emotion-ssr')
  )
  hydrate(ids)
}

const App = ({ Component, pageProps }) => {
  return <Component {...pageProps} />
}

export default App
