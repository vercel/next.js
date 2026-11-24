import type { NextApiRequest, NextApiResponse } from 'next'

// A 426 with the hop-by-hop headers an app may send its client.
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.statusCode = 426
  res.setHeader('Upgrade', 'example/2')
  res.setHeader('Proxy-Authenticate', 'Basic realm="shop"')
  res.setHeader('Connection', 'X-Listed')
  res.setHeader('X-Listed', 'listed')
  res.end('upgrade required')
}
