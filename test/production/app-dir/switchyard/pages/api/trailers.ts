import type { NextApiRequest, NextApiResponse } from 'next'

export const config = { api: { bodyParser: false } }

// Returns the request body and the trailer fields that came after it.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const chunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => chunks.push(chunk))
  req.on('end', () => {
    res.json({
      body: Buffer.concat(chunks).toString(),
      trailers: req.trailers,
    })
  })
}
