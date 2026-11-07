import type { NextApiRequest, NextApiResponse } from 'next'
import Module from 'node:module'

// Responds with the parsed request body, and with whether the server process
// has loaded the module that reads request bodies so far.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const loaded = Object.keys(
    (Module as unknown as { _cache: Record<string, unknown> })._cache
  )

  res.status(200).json({
    body: req.body,
    contentLength: req.headers['content-length'] ?? null,
    bodyReaderLoaded: loaded.some((id) =>
      id.replace(/\\/g, '/').includes('/next/dist/compiled/raw-body/')
    ),
  })
}
