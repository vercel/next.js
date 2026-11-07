import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await res.revalidate(req.query.path as string, {
      unstable_onlyGenerated: true,
    })
    res.json({ revalidated: true })
  } catch (err) {
    res.status(500).json({ revalidated: false, error: String(err) })
  }
}
