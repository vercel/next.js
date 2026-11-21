import type { NextApiRequest, NextApiResponse } from 'next'
import read from '../../fixtures/pages.template'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.send(read())
}
