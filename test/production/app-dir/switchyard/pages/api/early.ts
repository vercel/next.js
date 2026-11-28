import type { NextApiRequest, NextApiResponse } from 'next'

export const config = { api: { bodyParser: false } }

// Refuses an upload without reading its body.
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.statusCode = 403
  res.setHeader('content-length', 7)
  res.end('refused')
}
