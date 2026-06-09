import { NextApiRequest, NextApiResponse } from 'next'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb',
    },
  },
}

export default (req: NextApiRequest, res: NextApiResponse) => {
  res.status(200).json(req.body)
}
