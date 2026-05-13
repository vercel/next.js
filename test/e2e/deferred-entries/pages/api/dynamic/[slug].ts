import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
  slug: string
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const slug = Array.isArray(req.query.slug)
    ? req.query.slug.join('/')
    : (req.query.slug ?? '')

  res.status(200).json({ slug })
}
