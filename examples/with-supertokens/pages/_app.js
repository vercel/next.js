import '../styles/globals.css'
import React from 'react'
import SuperTokensReact from 'supertokens-auth-react'
import ThirdPartyEmailPasswordReact from 'supertokens-auth-react/recipe/thirdpartyemailpassword'
import SessionReact from 'supertokens-auth-react/recipe/session'
import SuperTokensNode from 'supertokens-node'
import SessionNode from 'supertokens-node/recipe/session'
import ThirdPartyEmailPasswordNode from 'supertokens-node/recipe/thirdpartyemailpassword'
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
      ThirdPartyEmailPasswordReact.init({
        emailVerificationFeature: {
          mode: 'REQUIRED',
        },
        signInAndUpFeature: {
          providers: [
            ThirdPartyEmailPasswordReact.Google.init(),
            ThirdPartyEmailPasswordReact.Github.init(),
            ThirdPartyEmailPasswordReact.Facebook.init(),
          ],
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
    recipeList: [
      ThirdPartyEmailPasswordNode.init({
        providers: [
          ThirdPartyEmailPasswordNode.Google({
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            clientId: process.env.GOOGLE_CLIENT_ID,
          }),
          ThirdPartyEmailPasswordNode.Github({
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            clientId: process.env.GITHUB_CLIENT_ID,
          }),
          ThirdPartyEmailPasswordNode.Facebook({
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
            clientId: process.env.FACEBOOK_CLIENT_ID,
          }),
        ],
      }),
      SessionNode.init(),
    ],
    isInServerlessEnv: true,
  })
}

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export default MyApp
