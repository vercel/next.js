import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(
  _request: NextApiRequest,
  response: NextApiResponse
) {
  response.json({ destination: 'Pages API' })
}
