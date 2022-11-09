import type { NextApiRequest, NextApiResponse } from 'next'
import type { Comment } from '../interfaces'
import redis from './redis'
import clearUrl from './clearUrl'

export default async function fetchComment(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const url = clearUrl(req.headers.referer)

  if (!redis) {
    return res.status(500).json({ message: 'Failed to connect to redis.' })
  }

  try {
    // get data
    const rawComments = await redis.lrange(url, 0, -1)

    // string data to object
    const comments = rawComments.map((c) => {
      const comment: Comment = JSON.parse(c)
      delete comment.user.email
      return comment
    })

    return res.status(200).json(comments)
  } catch (_) {
    return res.status(400).json({ message: 'Unexpected error occurred.' })
  }
}
