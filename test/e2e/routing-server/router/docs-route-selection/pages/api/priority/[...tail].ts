import type { NextApiRequest, NextApiResponse } from 'next'
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.json({ kind: 'catch-all', value: req.query.tail })
}
