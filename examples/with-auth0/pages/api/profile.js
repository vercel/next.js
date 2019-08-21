import { verifyRequest } from '../../lib/api/jwt-verify'

export default async (req, res) => {
  try {
    const { idToken } = await verifyRequest(req)
    res.status(200).json(idToken)
  } catch (error) {
    console.error(error)
    res.status(error.status || 400).end(error.message)
  }
}
