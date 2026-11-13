import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!req.query.load) {
    res.json({ value: 'idle' })
    return
  }

  const { value } = await import('../../lib/lazy-pages-api-target')
  res.json({ value })
}
