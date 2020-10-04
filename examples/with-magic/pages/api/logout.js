import { magic } from '../../lib/magic'
import { removeTokenCookie } from '../../lib/auth-cookies'
import { getSession } from '../../lib/iron'

export default async function logout(req, res) {
  const session = await getSession(req)
  await magic.users.logoutByIssuer(session.issuer)
  removeTokenCookie(res)
  res.writeHead(302, { Location: '/' })
  res.end()
}
