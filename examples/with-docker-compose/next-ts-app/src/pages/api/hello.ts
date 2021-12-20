// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

import { NextApiRequest, NextApiResponse } from 'next'

const handler = (_req: NextApiRequest, res: NextApiResponse) => {
  res.status(200).json({ message: 'Hello from Next.js TypeScript app' })
}

export default handler
