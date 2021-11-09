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
            clientId:
              '1060725074195-kmeum4crr01uirfl2op9kd5acmi9jutn.apps.googleusercontent.com',
            clientSecret: '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',
          }),
          ThirdPartyEmailPasswordNode.Github({
            clientId: '467101b197249757c71f',
            clientSecret: 'e97051221f4b6426e8fe8d51486396703012f5bd',
          }),
          ThirdPartyEmailPasswordNode.Apple({
            clientId: '4398792-io.supertokens.example.service',
            clientSecret: {
              keyId: '7M48Y4RYDL',
              privateKey:
                '-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgu8gXs+XYkqXD6Ala9Sf/iJXzhbwcoG5dMh1OonpdJUmgCgYIKoZIzj0DAQehRANCAASfrvlFbFCYqn3I2zeknYXLwtH30JuOKestDbSfZYxZNMqhF/OzdZFTV0zc5u5s3eN+oCWbnvl0hM+9IW0UlkdA\n-----END PRIVATE KEY-----',
              teamId: 'YWQCXGJRJL',
            },
          }),
          // ThirdPartyEmailPasswordNode.Facebook({
          //   clientSecret: process.env.FACEBOOK_CLIENT_SECRET || 'PLACEHOLDER',
          //   clientId: process.env.FACEBOOK_CLIENT_ID || 'PLACEHOLDER',
          // }),
        ],
      }),
      SessionNode.init(),
    ],
    isInServerlessEnv: true,
  }
}
