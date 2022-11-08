import redis from './redis'
import { NextApiRequest, NextApiResponse } from 'next'
import { unstable_getServerSession } from 'next-auth/next'
import { NextAuthOptions } from 'next-auth'
import { authOptions } from '../pages/api/auth/[...nextauth]'
import { nanoid } from 'nanoid'
import type { Comment, Session } from '../types'
import clearUrl from './clearUrl'

export default async function createComments(
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
  const { text } = req.body

  if (!text) {
    return res.status(400).json({ message: 'Missing parameter.' })
  }

  try {
    const comment: Comment = {
      id: nanoid(),
      created_at: Date.now(),
      url,
      text,
      user: {
        id: session.user.id,
        name: session.user.name,
        image: session.user.image,
      },
    }

    await redis.lpush(url, JSON.stringify(comment))

    return res.status(200).json(comment)
  } catch (_) {
    return res.status(400).json({ message: 'Unexpected error occurred.' })
  }
}
