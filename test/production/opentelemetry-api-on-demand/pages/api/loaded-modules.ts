import type { NextApiRequest, NextApiResponse } from 'next'
import Module from 'node:module'

// Reports which `next/dist` files the server process has loaded so far.
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const loaded = Object.keys(
    (Module as unknown as { _cache: Record<string, unknown> })._cache
  )
    .map((id) => id.replace(/\\/g, '/'))
    .filter((id) => id.includes('/next/dist/'))
    .map((id) => id.slice(id.lastIndexOf('/next/dist/') + 1))
    .sort()

  res.status(200).json(loaded)
}
