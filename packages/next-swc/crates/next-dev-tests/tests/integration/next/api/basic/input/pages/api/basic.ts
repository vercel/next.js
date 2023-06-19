// Next.js API route support: https://nextjs.org/docs/pages/building-your-application/routing/api-routes
import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
  hello: string
  input?: string | string[]
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  res.status(200).json({ hello: 'world', input: req.query.input })
}
