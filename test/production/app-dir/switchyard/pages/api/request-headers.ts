import type { NextApiRequest, NextApiResponse } from 'next'

// Returns the request headers as Node's server gives them to the app.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.json(req.headers)
}
