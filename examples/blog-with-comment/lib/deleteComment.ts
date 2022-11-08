import type { NextApiRequest, NextApiResponse } from 'next'
import { Session } from '../types'
import redis from './redis'
import { unstable_getServerSession } from 'next-auth/next'
import { authOptions } from '../pages/api/auth/[...nextauth]'
import { NextAuthOptions } from 'next-auth'
import clearUrl from './clearUrl'

export default async function deleteComments(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = (await unstable_getServerSession(
    req,
    res,
    authOptions as NextAuthOptions
  )) as Session

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const url = clearUrl(req.headers.referer)
  const { comment } = req.body

  if (!comment) {
    return res.status(400).json({ message: 'Missing parameter.' })
  }

  try {
    const isAdmin = session.user.role === 'admin'
    const isAuthor = session.user.id === comment.user.id

    if (!isAdmin && !isAuthor) {
      return res.status(400).json({ message: 'Unauthorized.' })
    }

    await redis.lrem(url, 0, JSON.stringify(comment))

    return res.status(200).end()
  } catch (err) {
    return res.status(400)
  }
}
