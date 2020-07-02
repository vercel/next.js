import Cookies from 'cookies'

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
        return cookies.get(cookieName, {
          signed: true,
        })
      },
      set: (cookieName, cookieVal, options = {}) => {
        cookies.set(cookieName, cookieVal, {
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
