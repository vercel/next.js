import * as functions from 'firebase-functions/v1'
import { authPublicOption } from '@/routings'
import {
  gravatarIconUrl,
  sendDiscord,
  skeetGraphql,
} from '@skeet-framework/utils'
import skeetConfig from '../../../skeetOptions.json'
import { User } from '@/models'
import { defineSecret } from 'firebase-functions/params'
import { inspect } from 'util'
const DISCORD_WEBHOOK_URL = defineSecret('DISCORD_WEBHOOK_URL')
const SKEET_GRAPHQL_ENDPOINT_URL = defineSecret('SKEET_GRAPHQL_ENDPOINT_URL')

const { region } = skeetConfig
const queryName = 'createUser'

export const authOnCreateUser = functions
  .runWith({
    ...authPublicOption,
    secrets: [DISCORD_WEBHOOK_URL, SKEET_GRAPHQL_ENDPOINT_URL],
  })
  .region(region)
  .auth.user()
  .onCreate(async (user) => {
    try {
      if (!user.email) throw new Error(`no email`)
      const { uid, email, displayName, photoURL } = user
      const userParams: User = {
        uid,
        email: email,
        username: displayName || email?.split('@')[0],
        iconUrl:
          photoURL == '' || !photoURL
            ? gravatarIconUrl(email ?? 'info@skeet.dev')
            : photoURL,
      }

      console.log({ userParams })
      const accessToken = 'skeet-access-token'
      const createUserResponse = await skeetGraphql(
        accessToken,
        SKEET_GRAPHQL_ENDPOINT_URL.value(),
        'mutation',
        queryName,
        userParams
      )

      console.log(
        inspect(createUserResponse, false, null, true /* enable colors */)
      )

      // Send Discord message when new user is created
      const content = `Skeet APP New user: ${userParams.username} \nemail: ${userParams.email}\niconUrl: ${userParams.iconUrl}`
      if (process.env.NODE_ENV === 'production') {
        await sendDiscord(content, DISCORD_WEBHOOK_URL.value())
      }
      console.log({ status: 'success' })
    } catch (error) {
      console.log({ status: 'error', message: String(error) })
    }
  })
