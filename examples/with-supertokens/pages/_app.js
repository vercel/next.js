import '../styles/globals.css'
import React from 'react'
import SuperTokensReact from 'supertokens-auth-react'
import EmailPasswordReact from 'supertokens-auth-react/recipe/emailpassword'
import SessionReact from 'supertokens-auth-react/recipe/session'
import SuperTokensNode from 'supertokens-node'
import SessionNode from 'supertokens-node/recipe/session'
import EmailPasswordNode from 'supertokens-node/recipe/emailpassword'
const port = process.env.APP_PORT || 3000
const websiteDomain =
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  `http://localhost:${port}`
const apiBasePath = '/api/auth/'

// Client Side configs.
if (typeof window !== 'undefined') {
  SuperTokensReact.init({
    useReactRouterDom: false,
    appInfo: {
      appName: 'SuperTokens Demo App',
      websiteDomain,
      apiDomain: websiteDomain,
      apiBasePath,
    },
    recipeList: [
      EmailPasswordReact.init({
        emailVerificationFeature: {
          mode: 'REQUIRED',
        },
      }),
      SessionReact.init(),
    ],
  })
} else {
  // Server Side configs.
  SuperTokensNode.init({
    supertokens: {
      connectionURI: 'https://try.supertokens.io', // Replace with your SuperTokens core instance. See https://supertokens.io/docs/emailpassword/quick-setup/supertokens-core/overview
    },
    appInfo: {
      appName: 'SuperTokens Demo App',
      websiteDomain,
      apiDomain: websiteDomain,
      apiBasePath,
    },
    recipeList: [EmailPasswordNode.init(), SessionNode.init()],
  })
}

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export default MyApp
