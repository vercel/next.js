// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'
import { log, withAxiom } from 'next-axiom'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  log.info('Hello from function', { url: req.url })
  res.status(200).json({ name: 'John Doe' })
}

export default withAxiom(handler)
