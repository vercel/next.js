import type { NextApiRequest, NextApiResponse } from 'next'

// A response whose Content-Length the app sets itself.
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('content-length', 5)
  res.end('sized')
}
