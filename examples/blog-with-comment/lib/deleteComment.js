import redis from './redis'
import getUser from './getUser'

export default async function deleteComments(req, res) {
  const { url, comment } = req.body
  const { authorization } = req.headers

  if (!url || !comment || !authorization) {
    return res.status(400).json({ message: 'Missing parameter.' })
  }

  try {
    // verify user token
    const user = await getUser(authorization)
    if (!user) return res.status(400).json({ message: 'Invalid token.' })
    comment.user.email = user.email

    const isAdmin = process.env.NEXT_PUBLIC_AUTH0_ADMIN_EMAIL === user.email
    const isAuthor = user.sub === comment.user.sub

    if (!isAdmin && !isAuthor) {
      return res.status(400).json({ message: 'Need authorization.' })
    }

    // delete
    await redis.lrem(url, 0, JSON.stringify(comment))

    return res.status(200).json()
  } catch (err) {
    return res.status(400)
  }
}
