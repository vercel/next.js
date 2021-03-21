import redis from '../../lib/redis'

export default async function upvote(req, res) {
  const features = (await redis.hvals('features'))
    .map((entry) => JSON.parse(entry))
    .sort((a, b) => b.score - a.score)

  res.status(200).json({ features })
}
