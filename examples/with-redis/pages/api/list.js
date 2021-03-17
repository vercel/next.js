import { getRedis } from './utils'

module.exports = async (req, res) => {
  let redis = getRedis()
  let n = await redis.zrevrange('roadmap', 0, 100, 'WITHSCORES')
  let result = []
  for (let i = 0; i < n.length - 1; i += 2) {
    let item = {}
    item['title'] = n[i]
    item['score'] = n[i + 1]
    result.push(item)
  }

  redis.quit()

  res.json({
    body: result,
  })
}
