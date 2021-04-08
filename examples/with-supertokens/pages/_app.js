import '../styles/globals.css'
import React from 'react'
import SuperTokensReact from 'supertokens-auth-react'
import SuperTokensNode from 'supertokens-node'
import * as SuperTokensConfig from './supertokensConfig'

if (typeof window !== 'undefined') {
  SuperTokensReact.init(SuperTokensConfig.frontendConfig())
} else {
  SuperTokensNode.init(SuperTokensConfig.backendConfig())
}

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export default MyApp
