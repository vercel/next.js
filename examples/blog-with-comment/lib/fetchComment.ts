import type { NextApiRequest, NextApiResponse } from 'next'
import redis from './redis'
import clearUrl from './clearUrl'

export default async function fetchComment(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const url = clearUrl(req.headers.referer)

    const comments = await redis.lrange(url, 0, -1)
    return res.status(200).json(comments)
  } catch (e) {
    return res.status(400).json({ message: e.message })
  }
}
