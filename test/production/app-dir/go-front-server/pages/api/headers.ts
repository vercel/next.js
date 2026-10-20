import type { NextApiRequest, NextApiResponse } from 'next'
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.json({ headers: req.headers, raw: req.rawHeaders })
}
