import type { NextApiRequest, NextApiResponse } from 'next'
import { waitForRelease } from '../../lib/release'

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  response.setHeader('Content-Type', 'text/plain')
  response.setHeader('Cache-Control', 'no-store')
  response.write('first\n')
  await waitForRelease(String(request.query.id))
  response.end('last\n')
}
