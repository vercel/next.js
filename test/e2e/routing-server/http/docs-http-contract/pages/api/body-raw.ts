import type { NextApiRequest, NextApiResponse } from 'next'
import { createHash } from 'node:crypto'

export const config = { api: { bodyParser: false } }

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    hash.update(chunk)
  }
  response.json({ bytes, hash: hash.digest('hex') })
}
