import React from 'react'
import RequiredByApp from '../requiredByApp'
import sideEffect from '../sideEffectModule'

sideEffect('_app')

function MyApp({ Component, pageProps }) {
  return (
    <React.Fragment>
      <RequiredByApp />
      <Component {...pageProps} />
    </React.Fragment>
  )
}

export default MyApp
