import fetchComment from '../../lib/fetchComment'
import createComments from '../../lib/createComment'
import deleteComments from '../../lib/deleteComment'

export default async function handler(req, res) {
  switch (req.method) {
    case 'GET':
      return fetchComment(req, res)
    case 'POST':
      return createComments(req, res)
    case 'DELETE':
      return deleteComments(req, res)
    default:
      return res.status(400).json({ message: 'Invalid method.' })
  }
}
