import ThirdPartyEmailPasswordNode from 'supertokens-node/recipe/thirdpartyemailpassword'
import SessionNode from 'supertokens-node/recipe/session'
import { appInfo } from './appInfo'

export let backendConfig = () => {
  return {
    framework: 'express',
    supertokens: {
      connectionURI: 'https://try.supertokens.io',
    },
    appInfo,
    recipeList: [
      ThirdPartyEmailPasswordNode.init({
        providers: [
          // We have provided you with development keys which you can use for testing.
          // IMPORTANT: Please replace them with your own OAuth keys for production use.
          ThirdPartyEmailPasswordNode.Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
          ThirdPartyEmailPasswordNode.Github({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          }),
          ThirdPartyEmailPasswordNode.Apple({
            clientId: process.env.APPLE_CLIENT_ID,
            clientSecret: {
              keyId: process.env.APPLE_KEY_ID,
              privateKey: process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
              teamId: process.env.APPLE_TEAM_ID,
            },
          }),
        ],
      }),
      SessionNode.init(),
    ],
    isInServerlessEnv: true,
  }
}
