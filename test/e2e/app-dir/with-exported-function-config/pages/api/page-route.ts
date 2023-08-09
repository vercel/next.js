import { NextApiResponse, NextApiRequest } from 'next'

export default function handler(
  _req: NextApiRequest,
  res: NextApiResponse<{ hello: string }>
) {
  return res.status(200).json({ hello: 'world' })
}

export const maxDuration = 1
