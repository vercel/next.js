import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Return the query parameters to verify they are parsed correctly
  res.status(200).json({
    query: req.query,
    url: req.url,
  })
}
