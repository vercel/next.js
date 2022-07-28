import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const body = req.body

  // Both of these are required.
  if (!body.first || !body.last) {
    return res.json({ data: 'First or last name not found' })
  }

  // Found the name.
  res.json({ data: `${body.first} ${body.last}` })
}
