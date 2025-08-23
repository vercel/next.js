import { NextApiRequest, NextApiResponse } from 'next/dist/types'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log(req.url)
  res.json({ now: Date.now() })
}
