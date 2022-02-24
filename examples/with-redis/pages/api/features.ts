import type { NextApiRequest, NextApiResponse } from 'next'

import redis from '../../lib/redis'

export default async function getAllFeatures(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const features = (await redis.hvals('features'))
    .map((entry) => JSON.parse(entry))
    .sort((a, b) => b.score - a.score)

  res.status(200).json({ features })
}
