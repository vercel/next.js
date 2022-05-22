import redis from './redis'

export default async function fetchComment(req, res) {
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
