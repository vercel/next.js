import { auth } from 'firebase-admin'
import { Request } from 'firebase-functions/v2/https'
import { gravatarIconUrl } from '@skeet-framework/utils'

export type UserAuthType = {
  uid: string
  username: string
  email: string
  iconUrl: string
}

export const getUserAuth = async (req: Request) => {
  try {
    const token = req.headers.authorization
    if (token == 'undefined' || token == null) throw new Error('Invalid token!')
    const bearer = token.split('Bearer ')[1]
    const user = await auth().verifyIdToken(bearer)
    const { uid, displayName, email, photoURL } = user
    const response: UserAuthType = {
      uid,
      username: displayName || email?.split('@')[0] || '',
      email: email || '',
      iconUrl:
        photoURL == '' || !photoURL
          ? gravatarIconUrl(email ?? 'info@skeet.dev')
          : photoURL,
    }
    return response
  } catch (error) {
    throw new Error(`getUserAuth: ${error}`)
  }
}

export const getUserBearerToken = async (req: Request) => {
  try {
    const token = req.headers.authorization
    if (token == 'undefined' || token == null) throw new Error('Invalid token!')
    const bearer = token.split('Bearer ')[1]
    return bearer
  } catch (error) {
    throw new Error(`getUserBearerToken: ${error}`)
  }
}
