const { setCookie } = require('nookies')

export const COOKIE_NAME = 'token'
const COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true, // don't let javascript steal this cookie
  sameSite: 'strict',
}

function generate(req, res) {
  // should generate your token here
  const token = 'my_token'

  setCookie({ req, res }, COOKIE_NAME, token, COOKIE_OPTIONS)
  return res.status(200).json({ status: 200 })
}

function delete_cookie(req, res) {
  setCookie({ req, res }, COOKIE_NAME, '', {
    ...COOKIE_OPTIONS,
    maxAge: -99999999,
  })
  return res.status(200).json({ status: 200 })
}

export default (req, res) => {
  if (req.method === 'POST') {
    return generate(req, res)
  }
  if (req.method === 'DELETE') {
    return delete_cookie(req, res)
  }

  return res.status(405).json({ status: 405 })
}
