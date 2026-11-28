import type { NextApiRequest, NextApiResponse } from 'next'

export const config = { api: { bodyParser: false } }

// Drops the connection without an answer, without waiting for the upload.
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.socket?.destroy()
}
