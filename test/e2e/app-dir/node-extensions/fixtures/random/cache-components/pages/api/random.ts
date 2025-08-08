import type { NextApiRequest, NextApiResponse } from 'next'

type ResponseData = {
  rand1: number
  rand2: number
}

export default function handler(
  _req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  res.status(200).json({ rand1: Math.random(), rand2: Math.random() })
}
