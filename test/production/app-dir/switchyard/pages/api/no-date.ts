import type { NextApiRequest, NextApiResponse } from 'next'

// A response the app sends without a Date header.
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.sendDate = false
  res.end('no date')
}
