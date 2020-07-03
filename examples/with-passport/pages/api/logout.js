import { removeTokenCookie } from '../../lib/auth-cookies'

export default async function logout(req, res) {
  removeTokenCookie(res)
  res.redirect('/')
}
