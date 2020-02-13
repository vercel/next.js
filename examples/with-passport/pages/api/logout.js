import { serialize } from 'cookie'

export default async function logout(req, res) {
  const cookie = serialize('token', '', {
    maxAge: -1,
    path: '/',
  })

  res.setHeader('Set-Cookie', cookie)
  res.writeHead(302, { Location: '/' })
  res.end()
}
