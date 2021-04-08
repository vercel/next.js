import '../styles/globals.css'
import React from 'react'
import SuperTokensReact from 'supertokens-auth-react'
import * as SuperTokensConfig from './supertokensConfig'

if (typeof window !== 'undefined') {
  SuperTokensReact.init(SuperTokensConfig.frontendConfig())
}

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export default MyApp
