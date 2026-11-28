import type { NextApiRequest, NextApiResponse } from 'next'

// Drops the connection without an answer.
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.socket?.destroy()
}
