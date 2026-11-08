import type { NextApiRequest, NextApiResponse } from 'next'
import { declared } from '../../lib/declared/pages-api'
import { undeclared } from '../../lib/undeclared/pages-api'
import { read } from '../../lib/use'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.json(
    read(
      () => undeclared(),
      () => declared(),
      req.query.use !== undefined
    )
  )
}
