import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const path = req.query.path
  if (typeof path !== 'string') {
    return res.status(400).send('Expected a path')
  }

  await res.revalidate(path)
  return res.json({ revalidated: true })
}
