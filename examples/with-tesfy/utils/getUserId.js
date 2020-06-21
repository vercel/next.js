import cookie from 'cookie'
import { v4 as uuidv4 } from 'uuid'

const COOKIE_NAME = 'user_id'
const COOKIE_MAX_AGE = 2147483647

const getUserId = (ctx) => {
  const { req, res } = ctx

  const cookies = cookie.parse(req.headers.cookie ?? '')
  let userId = cookies[COOKIE_NAME]

  if (!userId) {
    userId = uuidv4()
    res.setHeader(
      'Set-Cookie',
      cookie.serialize(COOKIE_NAME, userId, {
        maxAge: COOKIE_MAX_AGE,
        expires: new Date(Date.now() + COOKIE_MAX_AGE),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        sameSite: 'lax',
      })
    )
  }

  return userId
}

export default getUserId
