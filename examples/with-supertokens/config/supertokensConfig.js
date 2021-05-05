import ThirdPartyEmailPasswordNode from 'supertokens-node/recipe/thirdpartyemailpassword'
import SessionNode from 'supertokens-node/recipe/session'

import ThirdPartyEmailPasswordReact from 'supertokens-auth-react/recipe/thirdpartyemailpassword'
import SessionReact from 'supertokens-auth-react/recipe/session'

const port = process.env.APP_PORT || 3000
const websiteDomain =
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  `http://localhost:${port}`
const apiBasePath = '/api/auth/'

let appInfo = {
  appName: 'SuperTokens Demo App',
  websiteDomain,
  apiDomain: websiteDomain,
  apiBasePath,
}

export let backendConfig = () => {
  return {
    supertokens: {
      connectionURI: 'https://try.supertokens.io',
    },
    appInfo,
    recipeList: [
      ThirdPartyEmailPasswordNode.init({
        providers: [
          ThirdPartyEmailPasswordNode.Google({
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'PLACEHOLDER',
            clientId: process.env.GOOGLE_CLIENT_ID || 'PLACEHOLDER',
          }),
          ThirdPartyEmailPasswordNode.Github({
            clientSecret: process.env.GITHUB_CLIENT_SECRET || 'PLACEHOLDER',
            clientId: process.env.GITHUB_CLIENT_ID || 'PLACEHOLDER',
          }),
          ThirdPartyEmailPasswordNode.Facebook({
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET || 'PLACEHOLDER',
            clientId: process.env.FACEBOOK_CLIENT_ID || 'PLACEHOLDER',
          }),
        ],
      }),
      SessionNode.init(),
    ],
    isInServerlessEnv: true,
  }
}

export let frontendConfig = () => {
  return {
    appInfo,
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
  }
}
