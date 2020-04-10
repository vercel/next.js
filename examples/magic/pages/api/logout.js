import { removeTokenCookie } from '../../lib/auth-cookies'
import { getSession } from '../../lib/iron'

const { Magic } = require('@magic-sdk/admin')
const magic = new Magic(process.env.MAGIC_SECRET_KEY)

export default async function logout(req, res) {
  const session = await getSession(req)
  await magic.users.logoutByIssuer(session.issuer)
  removeTokenCookie(res)
  res.writeHead(302, { Location: '/' })
  res.end()
}
