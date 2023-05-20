import { query as q } from 'faunadb'
import cookie from 'cookie'
import { faunaClient, FAUNA_SECRET_COOKIE } from '../../utils/fauna-auth'

export const profileApi = async (faunaSecret) => {
  const ref = await faunaClient(faunaSecret).query(q.Identity())
  return ref.id
}

export default async function profile(req, res) {
  const cookies = cookie.parse(req.headers.cookie ?? '')
  const faunaSecret = cookies[FAUNA_SECRET_COOKIE]

  if (!faunaSecret) {
    return res.status(401).send('Auth cookie missing.')
  }

  res.status(200).json({ userId: await profileApi(faunaSecret) })
}
