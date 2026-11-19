import type { NextApiRequest, NextApiResponse } from 'next'

// Two set-cookie headers and no content-type.
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('set-cookie', ['a=1; Path=/', 'b=2; Path=/; HttpOnly'])
  res.end('no content type')
}
