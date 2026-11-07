import type { NextApiRequest, NextApiResponse } from 'next'
import { createControl, inYoungGeneration } from '../../lib/in-young-generation'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('x-test', '1')
  res.status(200).json({
    control: inYoungGeneration(createControl()),
    setHeader: inYoungGeneration(res.setHeader),
  })
}
