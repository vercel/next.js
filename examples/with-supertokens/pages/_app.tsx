import '../styles/globals.css'
import React from 'react'
import { useEffect } from 'react'
import SuperTokensReact, {
  SuperTokensWrapper,
  redirectToAuth,
} from 'supertokens-auth-react'
import * as SuperTokensConfig from '../config/frontendConfig'
import Session from 'supertokens-auth-react/recipe/session'

if (typeof window !== 'undefined') {
  SuperTokensReact.init(SuperTokensConfig.frontendConfig())
}

function MyApp({ Component, pageProps }): JSX.Element {
  useEffect(() => {
    async function doRefresh() {
      if (pageProps.fromSupertokens === 'needs-refresh') {
        if (await Session.attemptRefreshingSession()) {
          location.reload()
        } else {
          // user has been logged out
          redirectToAuth()
        }
      }
    }
    doRefresh()
  }, [pageProps.fromSupertokens])
  if (pageProps.fromSupertokens === 'needs-refresh') {
    return null
  }

  return (
    <SuperTokensWrapper>
      <Component {...pageProps} />
    </SuperTokensWrapper>
  )
}

export default MyApp
