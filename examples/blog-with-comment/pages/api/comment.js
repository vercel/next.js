import { nanoid } from 'nanoid'
import Boom from '@hapi/boom'
import errorResponse from '../../lib/errorResponse'
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
      return errorResponse(res, Boom.badRequest())
    }

    try {
      // get data
      const rawComments = await redis.lrange(url, 0, -1)
      // string data to object
      const comments = rawComments.map((comment) => JSON.parse(comment))

      return res.status(200).json(comments)
    } catch (_) {
      return errorResponse(res, Boom.expectationFailed())
    }
  }

  // CREATE COMMENT

  if (req.method === 'POST') {
    const { url, text } = req.body
    const { authorization } = req.headers

    if (!url || !text || !authorization) {
      return errorResponse(res, Boom.badRequest())
    }

    try {
      // verify user token
      const user = await fetchUser(authorization)
      if (!user) return errorResponse(res, Boom.unauthorized())

      const { name, picture, sub } = user

      const comment = {
        id: nanoid(),
        created_at: Date.now(),
        url,
        text,
        user: { name, picture, sub }
      }

      // write data
      await redis.lpush(url, JSON.stringify(comment))

      return res.status(200).json(comment)
    } catch (_) {
      return errorResponse(res, Boom.expectationFailed())
    }
  }

  // DELETE COMMENT

  if (req.method === 'DELETE') {
    const { url, comment } = req.body
    const { authorization } = req.headers

    if (!url || !comment || !authorization) {
      return errorResponse(res, Boom.badRequest())
    }

    try {
      // verify user token
      const user = await fetchUser(authorization)
      if (!user) return errorResponse(res, Boom.unauthorized())

      const isAuthor = user.sub === comment.user.sub

      if (!isAuthor) {
        return errorResponse(res, Boom.unauthorized())
      }

      await redis.lrem(url, 0, JSON.stringify(comment))

      return res.status(200).json()
    } catch (err) {
      return res.status(400)
    }
  }

  return errorResponse(res, Boom.methodNotAllowed())
}
