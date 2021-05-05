import { nanoid } from 'nanoid'
import redis from '../../lib/redis'

async function fetchUser(token) {
  const response = await fetch(
    `https://${process.env.NEXT_PUBLIC_AUTH0_DOMAIN}/userinfo`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  )
  return await response.json()
}

export default async (req, res) => {
  // FETCH COMMENTS

  if (req.method === 'GET') {
    const { url } = req.query

    if (!url) {
      return res.status(400).json({ message: 'Missing parameter.' })
    }

    try {
      // get data
      const rawComments = await redis.lrange(url, 0, -1)
      // string data to object
      const comments = rawComments.map((c) => {
        const comment = JSON.parse(c)
        delete comment.user.email
        return comment
      })

      return res.status(200).json(comments)
    } catch (_) {
      return res.status(400).json({ message: 'Unexpected error occurred.' })
    }
  }

  // CREATE COMMENT

  if (req.method === 'POST') {
    const { url, text } = req.body
    const { authorization } = req.headers

    if (!url || !text || !authorization) {
      return res.status(400).json({ message: 'Missing parameter.' })
    }

    try {
      // verify user token
      const user = await fetchUser(authorization)
      if (!user) return res.status(400).json({ message: 'Need authorization.' })

      const { name, picture, sub, email } = user

      const comment = {
        id: nanoid(),
        created_at: Date.now(),
        url,
        text,
        user: { name, picture, sub, email }
      }

      // write data
      await redis.lpush(url, JSON.stringify(comment))

      return res.status(200).json(comment)
    } catch (_) {
      return res.status(400).json({ message: 'Unexpected error occurred.' })
    }
  }

  // DELETE COMMENT

  if (req.method === 'DELETE') {
    const { url, comment } = req.body
    const { authorization } = req.headers

    if (!url || !comment || !authorization) {
      return res.status(400).json({ message: 'Missing parameter.' })
    }

    try {
      // verify user token
      const user = await fetchUser(authorization)
      if (!user) return res.status(400).json({ message: 'Invalid token.' })
      comment.user.email = user.email

      const isAdmin = process.env.NEXT_PUBLIC_AUTH0_ADMIN_EMAIL === user.email
      const isAuthor = user.sub === comment.user.sub

      if (!isAdmin && !isAuthor) {
        return res.status(400).json({ message: 'Need authorization.' })
      }

      await redis.lrem(url, 0, JSON.stringify(comment))

      return res.status(200).json()
    } catch (err) {
      return res.status(400)
    }
  }

  return res.status(400).json({ message: 'Invalid method.' })
}
