import redis from '../../lib/redis'

export default async function upvote(req, res) {
  const { title, id } = req.body
  const ip =
    req.headers['x-forwarded-for'] || req.headers['Remote_Addr'] || 'NA'
  const count = ip === 'NA' ? 1 : await redis.sadd('s:' + title, ip)

  if (count === 0) {
    res.status(400).json({
      error: 'You can not vote an item multiple times',
    })
  } else {
    const entry = JSON.parse((await redis.hget('features', id)) || 'null')
    const updated = {
      ...entry,
      score: entry.score + 1,
      ip,
    }

    await redis.hset('features', id, JSON.stringify(updated))
    return res.status(201).json(updated)
  }
}
