import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setDraftMode({ enable: true })
  res.end('Check your cookies...')
}
