import type { NextApiRequest, NextApiResponse } from 'next'
import shared from 'shared-pkg'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.json({ shared })
}
