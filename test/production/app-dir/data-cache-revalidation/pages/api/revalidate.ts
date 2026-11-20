import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  if (typeof request.query.path !== 'string') {
    response.status(400).end()
    return
  }

  await response.revalidate(request.query.path)
  response.json({ revalidated: true })
}
