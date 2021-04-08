import '../styles/globals.css'
import React from 'react'
import { useEffect } from 'react'
import SuperTokensReact from 'supertokens-auth-react'
import * as SuperTokensConfig from './supertokensConfig'
import Session from 'supertokens-auth-react/recipe/session'
import SuperTokensNode from 'supertokens-node'

if (typeof window !== 'undefined') {
  SuperTokensReact.init(SuperTokensConfig.frontendConfig())
} else {
  SuperTokensNode.init(SuperTokensConfig.backendConfig())
}

function MyApp({ Component, pageProps }) {
  useEffect(() => {
    async function doRefresh() {
      if (pageProps.fromSupertokens === 'needs-refresh') {
        await Session.attemptRefreshingSession()
        location.reload()
      }
    }
    doRefresh()
  }, [pageProps.fromSupertokens])
  if (pageProps.fromSupertokens === 'needs-refresh') {
    return null
  }
  return <Component {...pageProps} />
}

export default MyApp
