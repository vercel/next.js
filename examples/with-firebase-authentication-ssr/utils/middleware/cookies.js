import Cookies from 'cookies'
import { encodeBase64, decodeBase64 } from 'src/utils/encoding'

const serialize = (val) => encodeBase64(val)
const deserialize = (val) => decodeBase64(val)

// Adds a "cookie" getter/setter to the req object.
export const withCookies = (req, res) => {
  if (
    !(process.env.SESSION_SECRET_CURRENT && process.env.SESSION_SECRET_PREVIOUS)
  ) {
    throw new Error(
      'Session secrets must be set as env vars `SESSION_SECRET_CURRENT` and `SESSION_SECRET_PREVIOUS`.'
    )
  }

  // An array is useful for rotating secrets without invalidating old sessions.
  // The first will be used to sign cookies, and the rest to validate them.
  // https://github.com/expressjs/cookie-session#keys
  const sessionSecrets = [
    process.env.SESSION_SECRET_CURRENT,
    process.env.SESSION_SECRET_PREVIOUS,
  ]

  // https://github.com/pillarjs/cookies
  try {
    const cookies = Cookies(req, res, {
      keys: sessionSecrets,
      // TODO: set other options, such as "secure", "sameSite", etc.
      // https://github.com/expressjs/cookie-session#cookie-options
    })

    req.cookie = {
      get: (cookieName) => {
        try {
          return deserialize(
            cookies.get(cookieName, {
              signed: true,
            })
          )
        } catch (e) {
          return undefined
        }
      },
      set: (cookieName, cookieVal, options = {}) => {
        let serializedVal
        try {
          // If the value is not defined, set the value to undefined
          // so that the cookie will be deleted.
          if (cookieVal == null) {
            serializedVal = undefined
          } else {
            serializedVal = serialize(cookieVal)
          }
        } catch (e) {
          throw e
        }
        cookies.set(cookieName, serializedVal, {
          httpOnly: true,
          maxAge: 604800000, // week
          overwrite: true,
          ...options,
        })
      },
    }
  } catch (e) {
    throw e
  }
}

const cookiesMiddleware = (handler) => (req, res) => {
  try {
    withCookies(req, res)
  } catch (e) {
    return res
      .status(500)
      .json({ error: 'Could not add the cookies middleware.' })
  }
  return handler(req, res)
}

export default cookiesMiddleware
