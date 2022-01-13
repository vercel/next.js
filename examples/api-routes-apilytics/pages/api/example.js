import { withApilytics } from '@apilytics/next'

const handler = async (_req, res) => {
  return res.status(200).json({ message: 'OK' })
}

export default withApilytics(handler, '<your-api-key>')
