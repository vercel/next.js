import type { NextApiRequest, NextApiResponse } from 'next'
import { chosen } from '@chosen'
import { revision } from '../../lib/version'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.json({ revision, environment: process.env.RETENTION_ENV, chosen })
}
