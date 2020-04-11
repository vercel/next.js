const { parseCookies } = require('nookies')
const { COOKIE_NAME } = require('./cookie')

export default async (req, res) => {
  const cookies = parseCookies({ req, res })

  if (!cookies[COOKIE_NAME]) {
    return res.status(401).json({ status: 401, message: 'auth required' })
  }

  // here you should check the token is valid
  if (cookies[COOKIE_NAME] !== 'my_token') {
    return res.status(403).json({ status: 403, message: 'invalid token' })
  }

  // now we are good, return your data
  return res
    .status(200)
    .json({ status: 200, message: 'message from the backend' })
}
