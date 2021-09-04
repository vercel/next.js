import redis from './redis'
import { nanoid } from 'nanoid'
import getUser from './getUser'

export default async function createComments(req, res) {
  const { url, text } = req.body
  const { authorization } = req.headers

  if (!url || !text || !authorization) {
    return res.status(400).json({ message: 'Missing parameter.' })
  }

  try {
    // verify user token
    const user = await getUser(authorization)
    if (!user) return res.status(400).json({ message: 'Need authorization.' })

    const { name, picture, sub, email } = user

    const comment = {
      id: nanoid(),
      created_at: Date.now(),
      url,
      text,
      user: { name, picture, sub, email },
    }

    // write data
    await redis.lpush(url, JSON.stringify(comment))

    return res.status(200).json(comment)
  } catch (_) {
    return res.status(400).json({ message: 'Unexpected error occurred.' })
  }
}
