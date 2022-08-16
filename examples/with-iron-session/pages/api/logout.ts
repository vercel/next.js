import { withIronSessionApiRoute } from 'iron-session/next'
import { sessionOptions } from 'lib/session'
import { NextApiRequest, NextApiResponse } from 'next'
import type { User } from 'pages/api/user'

function logoutRoute(req: NextApiRequest, res: NextApiResponse<User>) {
  req.session.destroy()
  res.json({ isLoggedIn: false, login: '', avatarUrl: '' })
}

export default withIronSessionApiRoute(logoutRoute, sessionOptions)
