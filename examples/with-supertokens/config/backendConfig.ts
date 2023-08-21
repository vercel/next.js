import ThirdPartyEmailPasswordNode from 'supertokens-node/recipe/thirdpartyemailpassword'
import EmailVerificationNode from 'supertokens-node/recipe/emailverification'
import SessionNode from 'supertokens-node/recipe/session'
import { appInfo } from './appInfo'
import { AuthConfig } from '../interfaces'
import DashboardNode from 'supertokens-node/recipe/dashboard'

export let backendConfig = (): AuthConfig => {
  return {
    framework: 'express',
    supertokens: {
      connectionURI: 'https://try.supertokens.io',
    },
    appInfo,
    recipeList: [
      EmailVerificationNode.init({
        mode: 'REQUIRED',
      }),
      ThirdPartyEmailPasswordNode.init({
        providers: [
          // We have provided you with development keys which you can use for testing.
          // IMPORTANT: Please replace them with your own OAuth keys for production use.
          {
            config: {
              thirdPartyId: 'google',
              clients: [
                {
                  clientId: process.env.GOOGLE_CLIENT_ID,
                  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                },
              ],
            },
          },
          {
            config: {
              thirdPartyId: 'github',
              clients: [
                {
                  clientId: process.env.GITHUB_CLIENT_ID,
                  clientSecret: process.env.GITHUB_CLIENT_SECRET,
                },
              ],
            },
          },
          {
            config: {
              thirdPartyId: 'apple',
              clients: [
                {
                  clientId: process.env.APPLE_CLIENT_ID,
                  additionalConfig: {
                    keyId: process.env.APPLE_KEY_ID,
                    privateKey: process.env.APPLE_PRIVATE_KEY.replace(
                      /\\n/g,
                      '\n'
                    ),
                    teamId: process.env.APPLE_TEAM_ID,
                  },
                },
              ],
            },
          },
        ],
      }),
      SessionNode.init(),
      DashboardNode.init(),
    ],
    isInServerlessEnv: true,
  }
}
