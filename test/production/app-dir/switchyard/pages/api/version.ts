import type { NextApiRequest, NextApiResponse } from 'next'

// Returns the HTTP version Node reports for the request.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.end(`${req.httpVersion} ${req.httpVersionMajor} ${req.httpVersionMinor}`)
}
