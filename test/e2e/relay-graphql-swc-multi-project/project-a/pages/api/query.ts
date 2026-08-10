import { NextApiRequest, NextApiResponse } from 'next'

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ data: { greeting: string } }>
) {
  res.status(200).json({
    data: {
      greeting: 'Hello, World!',
    },
  })
}
