import type { NextApiRequest, NextApiResponse } from 'next'

export default async function revalidate(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await res.revalidate(req.body.path)
    res.json({ revalidated: true })
  } catch {
    res.json({ revalidated: false })
  }
}
