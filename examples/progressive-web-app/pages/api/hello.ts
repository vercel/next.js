// Next.js API route support: https://nextjs.org/docs/pages/building-your-application/routing/api-routes
import { NextApiRequest, NextApiResponse } from 'next'

const hello = (req: NextApiRequest, res: NextApiResponse) => {
  res.status(200).json({ name: 'John Doe' })
}

export default hello
