import type { NextApiRequest, NextApiResponse } from 'next'

// A response after which the app asks for the connection to be closed.
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Connection', 'close')
  res.end('closing')
}
