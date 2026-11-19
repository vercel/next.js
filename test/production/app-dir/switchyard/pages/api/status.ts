import type { NextApiRequest, NextApiResponse } from 'next'

// A reason phrase of the app's own, and one Node words differently from other
// servers.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.query.code === '413') {
    res.statusCode = 413
  } else {
    res.statusCode = 400
    res.statusMessage = 'Custom Reason'
  }
  res.end('status')
}
