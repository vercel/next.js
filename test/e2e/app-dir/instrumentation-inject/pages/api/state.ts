import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.query.error) {
    throw new Error('injected request failure')
  }
  res.json({
    runtime: process.env.NEXT_RUNTIME,
    order: process.env.INJECT_ORDER,
  })
}
